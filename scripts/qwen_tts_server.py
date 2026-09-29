"""
OpenAI-compatible Qwen3-TTS server (no vLLM).

GET  /v1/models
POST /v1/audio/speech  { model, input, voice, response_format, speed,
                         extra_body: { language, instruct, ref_audio, ref_text, seed } }

Speed knobs match Soul of Waifu Qwen3TTS_SOW_System (voice call):
  SDPA attention, CUDA:0 (no CPU offload), clone-prompt cache, short ICL ref,
  non_streaming_mode, max_new_tokens from text length.

faster-qwen3-tts (GitHub andimarafioti/faster-qwen3-tts + examples/openai_server.py):
  CUDA graphs, clone xvec_only (no ICL vocoder of the 3s ref), append_silence=False,
  non_streaming_mode=False for Base clone (upstream default). Their bench RTF
  excludes codec decode; ICL prepends ref codes then vocodes ref+output.

Spawned by electron/qwenProcess.mjs. Stdlib HTTP + qwen-tts + soundfile.
"""

from __future__ import annotations

import argparse
import inspect
import io
import json
import os
import sys
import tempfile
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

MODEL = None
MODEL_ID = ""
BACKEND = "qwen_tts"
# auto | cuda | cpu — cpu hides the GPU even if torch has CUDA.
DEVICE_MODE = "auto"
SR_FALLBACK = 24000
CLONE_PROMPT = None
CLONE_KEY = None
SYNTH_LOCK = threading.Lock()
WARMED = False
STARTUP_REF_AUDIO = ""
STARTUP_REF_TEXT = ""

# Length-based budget preserves short-line latency without truncating long chat
# replies at 192 codec tokens (~15 seconds). Still bound runaway generation.
QWEN_MAX_NEW_TOKENS = 2048
SOW_TOP_P = 0.9
SOW_TOP_K = 20
SOW_TEMPERATURE = 0.7
# ICL decode vocodes ref+output then cuts the ref. Keep the prefix short.
CLONE_REF_MAX_SEC = 3.0
# GitHub simple clone: speaker embedding only. ICL vocodes the whole ref every phrase.
FASTER_XVEC_ONLY = True
FASTER_APPEND_SILENCE = False


def _log(msg: str) -> None:
    sys.stderr.write(msg + "\n")
    sys.stderr.flush()


def _want_cuda() -> bool:
    if DEVICE_MODE == "cpu":
        return False
    import torch

    return bool(torch.cuda.is_available())


def _tune_cuda() -> None:
    import torch

    if not _want_cuda():
        return
    torch.backends.cuda.matmul.allow_tf32 = True
    torch.backends.cudnn.allow_tf32 = True
    # Speech length changes on every line. cuDNN benchmark would re-profile
    # many convolution shapes in the 12 Hz codec and can add seconds before
    # every decode, so prefer the cached heuristic choice for interactive TTS.
    torch.backends.cudnn.benchmark = False
    try:
        torch.backends.cuda.enable_flash_sdp(True)
        torch.backends.cuda.enable_mem_efficient_sdp(True)
    except Exception:
        pass
    try:
        torch.set_float32_matmul_precision("high")
    except Exception:
        pass


def _runtime_info() -> dict[str, Any]:
    import torch

    cuda = _want_cuda()
    gpu = ""
    if cuda:
        try:
            gpu = str(torch.cuda.get_device_name(0))
        except Exception:
            gpu = "cuda"
    faster = BACKEND == "faster"
    return {
        "ok": True,
        "engine": "faster-qwen3-tts" if faster else "qwen-tts",
        "backend": BACKEND,
        "clone": "xvec" if faster and FASTER_XVEC_ONLY else "icl",
        "device": "cuda" if cuda else "cpu",
        "requested": DEVICE_MODE,
        "gpu": gpu,
        "torch": str(torch.__version__),
        "warmed": WARMED,
    }


def _module_device(mod) -> str:
    try:
        inner = getattr(mod, "model", None) or mod
        return str(next(inner.parameters()).device)
    except Exception:
        return "?"


def _nn_core(mod):
    cur = mod
    for _ in range(3):
        nxt = getattr(cur, "model", None)
        if nxt is None or nxt is cur:
            break
        cur = nxt
    return cur


def _clone_create():
    for obj in (MODEL, getattr(MODEL, "model", None)):
        if obj is None:
            continue
        create = getattr(obj, "create_voice_clone_prompt", None)
        if callable(create):
            return create
    return None


def _pin_cuda() -> None:
    import torch

    if MODEL is None or not _want_cuda():
        return
    inner = _nn_core(MODEL)
    talker = _module_device(inner)
    tok = None
    for obj in (MODEL, getattr(MODEL, "model", None), inner):
        if obj is None:
            continue
        try:
            cand = getattr(obj, "speech_tokenizer", None)
        except Exception:
            cand = None
        if cand is not None:
            tok = cand
            break
    tok_dev = _module_device(tok) if tok is not None else "none"
    _log("qwen-tts devices · talker %s · tokenizer %s" % (talker, tok_dev))
    if tok is not None and not tok_dev.startswith("cuda"):
        try:
            core = getattr(tok, "model", tok)
            core.to("cuda:0")
            if hasattr(tok, "device"):
                tok.device = torch.device("cuda:0")
            _log("qwen-tts tokenizer moved CPU → cuda:0")
        except Exception as exc:
            _log("qwen-tts tokenizer stay %s: %s" % (tok_dev, str(exc)[:120]))
    if torch.cuda.is_available():
        alloc = torch.cuda.memory_allocated() / (1024**3)
        reserved = torch.cuda.memory_reserved() / (1024**3)
        _log("qwen-tts VRAM allocated %.2f GiB · reserved %.2f GiB" % (alloc, reserved))


def _enable_faster_logs() -> None:
    import logging

    log = logging.getLogger("faster_qwen3_tts")
    log.setLevel(logging.INFO)
    if not any(isinstance(h, logging.StreamHandler) for h in log.handlers):
        handler = logging.StreamHandler(sys.stderr)
        handler.setFormatter(logging.Formatter("%(message)s"))
        log.addHandler(handler)
    log.propagate = False


def _load_faster(model_id: str):
    global BACKEND
    import torch
    from faster_qwen3_tts import FasterQwen3TTS

    _enable_faster_logs()
    model = FasterQwen3TTS.from_pretrained(
        model_id,
        device="cuda",
        dtype=torch.bfloat16,
        attn_implementation="sdpa",
    )
    BACKEND = "faster"
    _log(
        "qwen-tts backend: faster-qwen3-tts · CUDA graphs · clone xvec_only=%s"
        % FASTER_XVEC_ONLY
    )
    return model


def _load_stock(model_id: str, kwargs: dict[str, Any]):
    from qwen_tts import Qwen3TTSModel

    try:
        return Qwen3TTSModel.from_pretrained(model_id, **kwargs)
    except Exception as exc:
        msg = str(exc).lower()
        if "max_memory" in msg or "device_map" in msg:
            kwargs.pop("max_memory", None)
            _log("qwen-tts: max_memory не принят, гружу без него")
            return Qwen3TTSModel.from_pretrained(model_id, **kwargs)
        if "attn" in msg or "sdpa" in msg:
            kwargs.pop("attn_implementation", None)
            _log("qwen-tts: SDPA недоступен, гружу без attn_implementation")
            return Qwen3TTSModel.from_pretrained(model_id, **kwargs)
        raise


def load_model(model_id: str) -> None:
    global MODEL, MODEL_ID, BACKEND
    import torch

    _tune_cuda()
    BACKEND = "qwen_tts"
    rt = _runtime_info()
    kwargs: dict[str, Any] = {}
    if rt["device"] == "cuda":
        # SoW: device_map auto + bfloat16 + SDPA (FlashAttention 2 often missing on Windows).
        # cuda:0 keeps the 0.6B fully on GPU — "auto" can spill layers to CPU and crawl.
        kwargs["device_map"] = "cuda:0"
        kwargs["dtype"] = torch.bfloat16
        kwargs["attn_implementation"] = "sdpa"
        # Forbid accelerate CPU offload (otherwise VRAM+RAM and 10s+ synth).
        kwargs["max_memory"] = {0: "11GiB", "cpu": "0GiB"}
        _log("qwen-tts: CUDA · %s · torch %s · sdpa · cuda:0" % (rt["gpu"], rt["torch"]))
    else:
        kwargs["device_map"] = "cpu"
        kwargs["dtype"] = torch.float32
        _log(
            "qwen-tts: CPU/RAM (%s) — видеопамять не используется, синтез в оперативке."
            % rt["torch"]
        )

    MODEL = None
    if rt["device"] == "cuda":
        try:
            MODEL = _load_faster(model_id)
        except Exception as exc:
            _log("qwen-tts faster skip, stock qwen-tts: %s" % str(exc)[:180])
            MODEL = None
            try:
                import gc

                gc.collect()
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except Exception:
                pass
    if MODEL is None:
        MODEL = _load_stock(model_id, kwargs)
        BACKEND = "qwen_tts"
        _log("qwen-tts backend: qwen-tts")
    MODEL_ID = model_id
    try:
        inner = getattr(MODEL, "model", None)
        if inner is not None and hasattr(inner, "eval"):
            inner.eval()
    except Exception:
        pass
    _pin_cuda()
    _log(f"qwen-tts ready: {model_id}")
    _warmup()


def _warmup() -> None:
    global WARMED
    if MODEL is None:
        return
    t0 = time.perf_counter()
    if BACKEND == "faster" and hasattr(MODEL, "warmup"):
        try:
            MODEL.warmup(prefill_len=100)
            _log("qwen-tts CUDA graphs captured %.2fs" % (time.perf_counter() - t0))
        except Exception as exc:
            _log("qwen-tts graph warmup skip: %s" % str(exc)[:180])
        t0 = time.perf_counter()
    try:
        import numpy as np
        import torch

        with torch.inference_mode():
            if is_base_model(MODEL_ID):
                dummy = np.zeros(int(24000 * 0.4), dtype=np.float32)
                temp_ref = None
                warm_ref = STARTUP_REF_AUDIO if Path(STARTUP_REF_AUDIO).is_file() else ""
                warm_text = STARTUP_REF_TEXT or "Hi"
                clone_kw: dict[str, Any] = {
                    "text": "Hi",
                    "language": "English",
                    "ref_audio": _load_clone_audio(warm_ref) if warm_ref else (dummy, 24000),
                    "ref_text": warm_text,
                    "max_new_tokens": 16,
                    "temperature": SOW_TEMPERATURE,
                    "top_p": SOW_TOP_P,
                    "top_k": SOW_TOP_K,
                }
                if BACKEND == "faster":
                    # faster-qwen3-tts currently accepts a path here, unlike
                    # stock qwen-tts. Prime the speaker encoder and codec now
                    # so the user's first line does not pay that cold-start.
                    if warm_ref:
                        clone_kw["ref_audio"] = warm_ref
                    else:
                        fd, temp_ref = tempfile.mkstemp(suffix=".wav")
                        os.close(fd)
                        import soundfile as sf

                        sf.write(temp_ref, dummy, 24000, format="WAV")
                        clone_kw["ref_audio"] = temp_ref
                    clone_kw["xvec_only"] = FASTER_XVEC_ONLY
                    clone_kw["append_silence"] = FASTER_APPEND_SILENCE
                    clone_kw["non_streaming_mode"] = False
                else:
                    clone_kw["non_streaming_mode"] = True
                try:
                    MODEL.generate_voice_clone(**clone_kw)
                finally:
                    if temp_ref:
                        try:
                            os.unlink(temp_ref)
                        except OSError:
                            pass
            else:
                custom_kw: dict[str, Any] = {
                    "text": "Hi",
                    "language": "English",
                    "speaker": "Serena",
                    "max_new_tokens": 16,
                    "temperature": SOW_TEMPERATURE,
                    "top_p": SOW_TOP_P,
                    "top_k": SOW_TOP_K,
                }
                if BACKEND != "faster":
                    custom_kw["non_streaming_mode"] = True
                MODEL.generate_custom_voice(**custom_kw)
        WARMED = True
        _log("qwen-tts warmup %.2fs" % (time.perf_counter() - t0))
    except Exception as exc:
        _log("qwen-tts warmup skip: %s" % str(exc)[:180])


def is_base_model(model_id: str) -> bool:
    name = model_id.replace("\\", "/").lower()
    return "base" in Path(name).name or name.endswith("/base") or "-base" in name


def _clone_accepts_instruct() -> bool:
    fn = getattr(MODEL, "generate_voice_clone", None)
    if not callable(fn):
        return False
    try:
        return "instruct" in inspect.signature(fn).parameters
    except (TypeError, ValueError):
        return False


def _parse_seed(extra: dict[str, Any]) -> int | None:
    raw = extra.get("seed")
    if raw is None or raw == "":
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _fn_accepts(fn: Any, name: str) -> bool:
    if not callable(fn):
        return False
    try:
        return name in inspect.signature(fn).parameters
    except (TypeError, ValueError):
        return False


def _put_seed_kw(kw: dict[str, Any], extra: dict[str, Any], fn: Any) -> None:
    seed = _parse_seed(extra)
    if seed is None:
        return
    if _fn_accepts(fn, "seed"):
        kw["seed"] = seed


def _apply_torch_seed(seed: int) -> None:
    import random

    random.seed(seed)
    try:
        import numpy as np

        np.random.seed(seed)
    except Exception:
        pass
    import torch

    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def wav_bytes(audio, sr: int) -> bytes:
    import soundfile as sf
    import numpy as np

    arr = audio
    if hasattr(arr, "detach"):
        arr = arr.detach().cpu().numpy()
    arr = np.asarray(arr)
    if arr.ndim > 1:
        arr = arr.squeeze()
    buf = io.BytesIO()
    sf.write(buf, arr, int(sr or SR_FALLBACK), format="WAV")
    return buf.getvalue()


def _cap_new_tokens(text: str) -> int:
    # Keep in sync with electron/qwenLaunch.mjs qwenMaxNewTokens.
    n = len(text.strip())
    return min(QWEN_MAX_NEW_TOKENS, max(40, n * 2 + 24))


def _gen_kw(extra: dict[str, Any], text: str) -> dict[str, Any]:
    kw: dict[str, Any] = {
        "max_new_tokens": _cap_new_tokens(text),
        "top_p": SOW_TOP_P,
        "top_k": SOW_TOP_K,
        "temperature": SOW_TEMPERATURE,
    }
    if extra.get("temperature") is not None:
        try:
            kw["temperature"] = float(extra["temperature"])
        except (TypeError, ValueError):
            pass
    if extra.get("top_p") is not None:
        try:
            kw["top_p"] = float(extra["top_p"])
        except (TypeError, ValueError):
            pass
    if extra.get("top_k") is not None:
        try:
            kw["top_k"] = int(extra["top_k"])
        except (TypeError, ValueError):
            pass
    if extra.get("max_new_tokens") is not None:
        try:
            kw["max_new_tokens"] = max(16, min(QWEN_MAX_NEW_TOKENS, int(extra["max_new_tokens"])))
        except (TypeError, ValueError):
            pass
    if extra.get("repetition_penalty") is not None:
        try:
            kw["repetition_penalty"] = float(extra["repetition_penalty"])
        except (TypeError, ValueError):
            pass
    return kw


def _load_clone_audio(path: str):
    import numpy as np
    import soundfile as sf

    wav, sr = sf.read(path, dtype="float32", always_2d=False)
    arr = np.asarray(wav)
    if arr.ndim > 1:
        arr = arr.mean(axis=1)
    max_n = int(float(sr) * CLONE_REF_MAX_SEC)
    if arr.shape[0] > max_n:
        arr = arr[:max_n]
    return arr, int(sr)


def _cached_clone_prompt(ref_audio: str, ref_text: str):
    global CLONE_PROMPT, CLONE_KEY
    create = _clone_create()
    if create is None:
        return None
    mtime = 0.0
    try:
        mtime = Path(ref_audio).stat().st_mtime
    except OSError:
        pass
    key = (ref_audio, ref_text, mtime, CLONE_REF_MAX_SEC)
    if CLONE_PROMPT is not None and CLONE_KEY == key:
        return CLONE_PROMPT
    t0 = time.perf_counter()
    wav, sr = _load_clone_audio(ref_audio)
    CLONE_PROMPT = create(
        ref_audio=(wav, sr),
        ref_text=ref_text or None,
    )
    try:
        import torch

        if _want_cuda() and isinstance(CLONE_PROMPT, list):
            for item in CLONE_PROMPT:
                code = getattr(item, "ref_code", None)
                if code is not None and hasattr(code, "to"):
                    item.ref_code = code.to("cuda:0", non_blocking=True)
                emb = getattr(item, "ref_spk_embedding", None)
                if emb is not None and hasattr(emb, "to"):
                    item.ref_spk_embedding = emb.to("cuda:0", non_blocking=True)
    except Exception:
        pass
    CLONE_KEY = key
    _log(
        "qwen-tts clone-prompt cache %.2fs · ref %.1fs"
        % (time.perf_counter() - t0, wav.shape[0] / max(sr, 1))
    )
    return CLONE_PROMPT


def synthesize(body: dict[str, Any]) -> tuple[bytes, dict[str, str]]:
    if MODEL is None:
        raise RuntimeError("модель не загружена")
    import torch

    text = str(body.get("input") or body.get("text") or "").strip()
    if not text:
        raise ValueError("пустой input")
    extra = body.get("extra_body") if isinstance(body.get("extra_body"), dict) else {}
    language = str(
        extra.get("language") or body.get("language") or "English"
    )
    speaker = str(body.get("voice") or "Serena")
    instruct = extra.get("instruct") or body.get("instruct")
    ref_audio = extra.get("ref_audio") or body.get("ref_audio")
    ref_text = extra.get("ref_text") or body.get("ref_text") or ""
    gen_kw = _gen_kw(extra, text)
    clone_kw = dict(gen_kw)
    if instruct and _clone_accepts_instruct():
        clone_kw["instruct"] = str(instruct)
    seed = _parse_seed(extra)
    _put_seed_kw(clone_kw, extra, getattr(MODEL, "generate_voice_clone", None))

    model_id = str(body.get("model") or MODEL_ID)
    use_clone = is_base_model(model_id) or is_base_model(MODEL_ID)
    t0 = time.perf_counter()
    prompt_s = 0.0
    with SYNTH_LOCK, torch.inference_mode():
        if seed is not None:
            _apply_torch_seed(seed)
        if use_clone:
            if not ref_audio:
                raise ValueError("Base-клон: нужен extra_body.ref_audio (wav госпожи)")
            if not Path(str(ref_audio)).is_file():
                raise ValueError(f"Base-клон: нет файла {ref_audio}")
            if BACKEND == "faster":
                wavs, sr = MODEL.generate_voice_clone(
                    text=text,
                    language=language,
                    ref_audio=str(ref_audio),
                    ref_text=str(ref_text),
                    xvec_only=FASTER_XVEC_ONLY,
                    append_silence=FASTER_APPEND_SILENCE,
                    non_streaming_mode=False,
                    **clone_kw,
                )
            else:
                t_prompt = time.perf_counter()
                prompt = _cached_clone_prompt(str(ref_audio), str(ref_text))
                prompt_s = time.perf_counter() - t_prompt
                if prompt is not None:
                    wavs, sr = MODEL.generate_voice_clone(
                        text=text,
                        language=language,
                        voice_clone_prompt=prompt,
                        non_streaming_mode=True,
                        **clone_kw,
                    )
                else:
                    wav, ref_sr = _load_clone_audio(str(ref_audio))
                    wavs, sr = MODEL.generate_voice_clone(
                        text=text,
                        language=language,
                        ref_audio=(wav, ref_sr),
                        ref_text=str(ref_text),
                        non_streaming_mode=True,
                        **clone_kw,
                    )
        else:
            kwargs: dict[str, Any] = {
                "text": text,
                "language": language,
                "speaker": speaker,
                **gen_kw,
            }
            if BACKEND != "faster":
                kwargs["non_streaming_mode"] = True
            if instruct:
                kwargs["instruct"] = str(instruct)
            _put_seed_kw(kwargs, extra, getattr(MODEL, "generate_custom_voice", None))
            wavs, sr = MODEL.generate_custom_voice(**kwargs)
    wall = time.perf_counter() - t0
    audio = wavs[0]
    if hasattr(audio, "detach"):
        n_samples = int(audio.numel()) if hasattr(audio, "numel") else 0
    else:
        import numpy as np

        n_samples = int(np.asarray(audio).size)
    audio_s = n_samples / float(sr or SR_FALLBACK) if n_samples else 0.0
    clone_mode = (
        "xvec"
        if BACKEND == "faster" and use_clone
        else "icl"
        if use_clone
        else "custom"
    )
    _log(
        "qwen-tts synth %.2fs · audio %.2fs · prompt %.2fs · %d chars · max_tok %d · %s · %s"
        % (
            wall,
            audio_s,
            prompt_s,
            len(text),
            int(gen_kw["max_new_tokens"]),
            BACKEND,
            clone_mode,
        )
    )
    realtime_x = audio_s / wall if wall > 0 else 0.0
    return wav_bytes(wavs[0], sr), {
        "X-JOI-Generation-Ms": str(round(wall * 1000)),
        "X-JOI-Audio-Seconds": f"{audio_s:.3f}",
        "X-JOI-Realtime-X": f"{realtime_x:.3f}",
        "X-JOI-Backend": BACKEND,
        "X-JOI-Device": "cuda" if _want_cuda() else "cpu",
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: Any) -> None:
        _log("%s - %s" % (self.address_string(), fmt % args))

    def _send(
        self,
        code: int,
        body: bytes,
        content_type: str,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header(
            "Access-Control-Expose-Headers",
            "X-JOI-Generation-Ms, X-JOI-Audio-Seconds, X-JOI-Realtime-X, X-JOI-Backend, X-JOI-Device",
        )
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code: int, obj: Any) -> None:
        raw = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self._send(code, raw, "application/json; charset=utf-8")

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path.rstrip("/") or "/"
        if path in ("/v1/models", "/models"):
            self._json(
                200,
                {
                    "object": "list",
                    "data": [{"id": MODEL_ID or "qwen-tts", "object": "model"}],
                },
            )
            return
        if path in ("/health", "/v1/health"):
            self._json(200, _runtime_info())
            return
        self._json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path.rstrip("/") or "/"
        if path not in ("/v1/audio/speech", "/audio/speech"):
            self._json(404, {"error": "not found"})
            return
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n) if n else b"{}"
        try:
            body = json.loads(raw.decode("utf-8") or "{}")
            if not isinstance(body, dict):
                raise ValueError("JSON object expected")
            wav, timing = synthesize(body)
        except Exception as exc:
            _log(traceback.format_exc())
            self._json(400, {"error": str(exc)[:400]})
            return
        self._send(200, wav, "audio/wav", timing)


def main() -> None:
    global DEVICE_MODE, STARTUP_REF_AUDIO, STARTUP_REF_TEXT
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--model", required=True, help="HF id or local snapshot dir")
    parser.add_argument(
        "--device",
        choices=("auto", "cuda", "cpu"),
        default="auto",
        help="cpu = RAM only (CUDA stays free for Ollama)",
    )
    parser.add_argument("--ref-audio", default="", help="optional Base warmup wav")
    parser.add_argument("--ref-text", default="", help="transcript for warmup wav")
    args = parser.parse_args()
    os.environ.setdefault("PYTHONUTF8", "1")
    DEVICE_MODE = str(args.device)
    STARTUP_REF_AUDIO = str(args.ref_audio or "")
    STARTUP_REF_TEXT = str(args.ref_text or "")
    if DEVICE_MODE == "cpu":
        os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
    try:
        load_model(args.model)
    except Exception:
        _log(traceback.format_exc())
        sys.exit(1)
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    _log(f"qwen-tts listening http://{args.host}:{args.port}/v1")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
