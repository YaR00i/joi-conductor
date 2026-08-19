"""
WD14 MoAT tagger server for joi-conductor.

Lightweight FastAPI server that loads the WD-V1-4 MoAT tagger ONNX model once
and serves `POST /tag` (multipart image) → booru tags. Spawned (optional) by
electron/wd14Process.mjs on port 7878; the renderer prefers this server and
falls back to onnxruntime-web in the browser when it is offline.

Model files (download once, see docs/WD14_TAGGER.md):
    scripts/wd14-models/
        model.onnx            # wd-v1-4-moat-tagger.onnx  (~440MB)
        selected_tags.csv     # tag names + categories

Run standalone:
    python scripts/wd14_server.py
    # or with a custom conda env / model dir:
    python scripts/wd14_server.py --port 7878 --model-dir scripts/wd14-models

Dependencies: fastapi, uvicorn, onnxruntime, numpy, pillow, python-multipart
"""

from __future__ import annotations

import argparse
import csv
import io
import os
import sys
from pathlib import Path
from typing import List, Tuple

import numpy as np
from PIL import Image

try:
    import onnxruntime as ort
except ImportError as exc:  # pragma: no cover
    sys.stderr.write(
        "onnxruntime не установлен. Поставь: pip install onnxruntime\n"
    )
    raise exc

try:
    from fastapi import FastAPI, File, UploadFile, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
    import uvicorn
except ImportError as exc:  # pragma: no cover
    sys.stderr.write(
        "fastapi/uvicorn не установлены. Поставь: pip install fastapi uvicorn python-multipart\n"
    )
    raise exc


DEFAULT_MODEL_DIR = Path(__file__).resolve().parent / "wd14-models"
DEFAULT_PORT = 7878
IMAGE_SIZE = 448

# ImageNet normalization (WD-V1-4 MoAT preprocessing)
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


class TagScore(BaseModel):
    tag: str
    score: float


class TagResult(BaseModel):
    tags: List[str]
    scores: List[TagScore]


def load_tags(csv_path: Path) -> Tuple[List[str], List[int]]:
    """Return (tag_names, category_ids). Categories: 0=general, 1=character, 3=system, 4=rating."""
    names: List[str] = []
    cats: List[int] = []
    with csv_path.open("r", encoding="utf-8") as fh:
        reader = csv.reader(fh)
        header = next(reader, None)
        for row in reader:
            if len(row) < 2:
                continue
            names.append(row[0])
            try:
                cats.append(int(row[1]))
            except ValueError:
                cats.append(0)
    return names, cats


def preprocess(image_bytes: bytes) -> np.ndarray:
    """PIL → RGB on white → resize 448 → normalize. Returns (1, 448, 448, 3) float32."""
    img = Image.open(io.BytesIO(image_bytes))
    if img.mode == "P":
        img = img.convert("RGBA")
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        rgba = img.convert("RGBA")
        bg.paste(rgba, mask=rgba.split()[-1])
        img = bg
    else:
        img = img.convert("RGB")
    img = img.resize((IMAGE_SIZE, IMAGE_SIZE), Image.LANCZOS)
    arr = np.asarray(img, dtype=np.float32) / 255.0
    arr = (arr - MEAN) / STD
    return np.expand_dims(arr, axis=0)


class TaggerModel:
    def __init__(self, model_dir: Path):
        onnx_path = model_dir / "model.onnx"
        if not onnx_path.exists():
            # Allow the original HF filename as an alias.
            alt = model_dir / "wd-v1-4-moat-tagger.onnx"
            if alt.exists():
                onnx_path = alt
            else:
                raise FileNotFoundError(
                    f"ONNX модель не найдена в {model_dir}. Положи model.onnx "
                    f"(wd-v1-4-moat-tagger.onnx) и selected_tags.csv. "
                    f"См. docs/WD14_TAGGER.md."
                )
        csv_path = model_dir / "selected_tags.csv"
        if not csv_path.exists():
            raise FileNotFoundError(
                f"selected_tags.csv не найден в {model_dir}."
            )

        providers = ["CPUExecutionProvider"]
        available = ort.get_available_providers()
        if "CUDAExecutionProvider" in available:
            providers.insert(0, "CUDAExecutionProvider")

        # Silence onnxruntime internal logs unless debugging.
        sess_opts = ort.SessionOptions()
        sess_opts.log_severity_level = 3  # WARNING+
        self.session = ort.InferenceSession(
            str(onnx_path), sess_options=sess_opts, providers=providers
        )
        self.input_name = self.session.get_inputs()[0].name
        self.tag_names, self.tag_cats = load_tags(csv_path)
        sys.stderr.write(
            f"[wd14] loaded {len(self.tag_names)} tags from {csv_path.name}; "
            f"providers={providers}\n"
        )

    def predict(
        self, image_bytes: bytes, general_threshold: float = 0.35,
        character_threshold: float = 0.85, max_tags: int = 60,
    ) -> TagResult:
        x = preprocess(image_bytes)
        preds = self.session.run(None, {self.input_name: x})[0]
        # MoAT may return either (1, N) or a dict-like; assume (1, N).
        probs = np.asarray(preds[0]).astype(np.float32)

        scores: List[TagScore] = []
        tags: List[str] = []
        # Rating tags (cat 4) and system tags (cat 3) are skipped from the
        # primary tag list but could be surfaced later.
        for name, cat, p in zip(self.tag_names, self.tag_cats, probs):
            if cat == 4 or cat == 3:
                continue
            threshold = character_threshold if cat == 1 else general_threshold
            if float(p) >= threshold:
                scores.append(TagScore(tag=name, score=round(float(p), 4)))
                tags.append(name)
        # Sort by score desc, cap.
        scores.sort(key=lambda t: t.score, reverse=True)
        if len(scores) > max_tags:
            scores = scores[:max_tags]
            tags = [t.tag for t in scores]
        return TagResult(tags=tags, scores=scores)


def create_app(model_dir: Path) -> FastAPI:
    app = FastAPI(title="joi-conductor WD14 tagger")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    state: dict = {}

    @app.on_event("startup")
    def _load() -> None:
        try:
            state["model"] = TaggerModel(model_dir)
            state["error"] = None
        except Exception as exc:  # pragma: no cover
            state["model"] = None
            state["error"] = str(exc)
            sys.stderr.write(f"[wd14] model load failed: {exc}\n")

    @app.get("/health")
    def health():
        if state.get("model") is not None:
            return {"online": True, "model_loaded": True}
        return {
            "online": state.get("error") is None,
            "model_loaded": False,
            "detail": state.get("error"),
        }

    @app.get("/models")
    def models():
        # OpenAI-compatible-ish ping endpoint (mirrors vLLM).
        return {
            "object": "list",
            "data": [{"id": "wd14-moat", "object": "model"}],
            "online": state.get("model") is not None,
        }

    @app.post("/tag", response_model=TagResult)
    async def tag(
        file: UploadFile = File(...),
        general_threshold: float = 0.35,
        character_threshold: float = 0.85,
        max_tags: int = 60,
    ):
        model = state.get("model")
        if model is None:
            raise HTTPException(
                status_code=503,
                detail=state.get("error")
                or "модель не загружена — проверь scripts/wd14-models/",
            )
        data = await file.read()
        if not data:
            raise HTTPException(status_code=400, detail="пустой файл")
        return model.predict(
            data,
            general_threshold=general_threshold,
            character_threshold=character_threshold,
            max_tags=max_tags,
        )

    return app


def main() -> None:
    parser = argparse.ArgumentParser(description="WD14 MoAT tagger server")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument(
        "--model-dir",
        default=str(DEFAULT_MODEL_DIR),
        help="директория с model.onnx и selected_tags.csv",
    )
    args = parser.parse_args()

    model_dir = Path(args.model_dir).resolve()
    if not model_dir.exists():
        sys.stderr.write(
            f"[wd14] модель не найдена: {model_dir}. Создай папку и положи "
            f"model.onnx + selected_tags.csv (см. docs/WD14_TAGGER.md).\n"
        )

    app = create_app(model_dir)
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
