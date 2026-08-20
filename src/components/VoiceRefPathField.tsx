import { useEffect, useState } from "react";
import {
  importVoiceRefFromDialog,
  showVoiceRefFolder,
  statVoiceRefFile,
} from "../lib/voice/importVoiceRef";
import {
  SOVITS_REF_MIN_SECONDS,
  isSovitsRefRel,
  maxSecondsForVoiceRef,
} from "../lib/voiceRefPath";

type Props = {
  destRel: string;
  value: string;
  disabled?: boolean;
  onPath: (rel: string) => void;
  onHint?: (msg: string) => void;
  label?: string;
};

function formatBytes(bytes: number | undefined): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) {
    return "";
  }
  if (bytes < 1024) return `${bytes} Б`;
  return `${Math.round(bytes / 1024)} КБ`;
}

export function VoiceRefPathField({
  destRel,
  value,
  disabled,
  onPath,
  onHint,
  label = "Референс wav",
}: Props) {
  const [busy, setBusy] = useState(false);
  const [exists, setExists] = useState<boolean | null>(null);
  const [bytes, setBytes] = useState<number | undefined>(undefined);
  const [importedSec, setImportedSec] = useState<number | null>(null);
  const desktop = Boolean(window.joiDesktop?.tts?.voiceRefShow);
  const probePath = value.trim() || destRel;

  useEffect(() => {
    let cancel = false;
    if (!window.joiDesktop?.tts?.voiceRefStat) {
      setExists(null);
      return;
    }
    void statVoiceRefFile(probePath).then((st) => {
      if (cancel) return;
      setExists(st.exists);
      setBytes(st.bytes);
    });
    return () => {
      cancel = true;
    };
  }, [probePath]);

  async function openFolder() {
    try {
      await showVoiceRefFolder(probePath);
    } catch (err) {
      onHint?.(err instanceof Error ? err.message : "не удалось открыть папку");
    }
  }

  async function pickFile() {
    setBusy(true);
    setImportedSec(null);
    onHint?.("Конвертирую в wav…");
    try {
      const res = await importVoiceRefFromDialog(destRel);
      if (!res) {
        onHint?.("Отмена");
        return;
      }
      onPath(res.relPath);
      setExists(true);
      setImportedSec(res.seconds);
      const cap = maxSecondsForVoiceRef(destRel);
      const shortSovits =
        isSovitsRefRel(destRel) && res.seconds + 0.05 < SOVITS_REF_MIN_SECONDS;
      const sec = res.seconds.toFixed(1);
      onHint?.(
        shortSovits
          ? `Короткий клип (${sec} с). SoVITS лучше с 4–10 с чистой речи.`
          : `Успешно · реф принят (${sec} с, макс. ${cap} с) → ${res.relPath}${
              res.sourcePath ? ` ← ${res.sourcePath}` : ""
            }`,
      );
    } catch (err) {
      setExists(false);
      setImportedSec(null);
      onHint?.(err instanceof Error ? err.message : "ошибка импорта");
    } finally {
      setBusy(false);
    }
  }

  const statusClass =
    busy
      ? "is-busy"
      : exists === true
        ? "is-ok"
        : exists === false
          ? "is-miss"
          : "";
  const statusText = busy
    ? "конвертирую…"
    : importedSec != null && exists
      ? `Успешно · принят как реф · ${importedSec.toFixed(1)} с`
      : exists === true
        ? `реф на диске${formatBytes(bytes) ? ` · ${formatBytes(bytes)}` : ""}`
        : exists === false
          ? "файла нет"
          : "";

  return (
    <div
      className={
        "brain-field" + (exists === true ? " is-ref-ready" : "")
      }
    >
      <span className="brain-field__label-row">
        <span className="field__label">{label}</span>
        {statusText ? (
          <em className={`voice-ref-status ${statusClass}`}>{statusText}</em>
        ) : null}
      </span>
      <input
        value={value}
        disabled={disabled}
        onChange={(e) => {
          setImportedSec(null);
          onPath(e.target.value);
        }}
        placeholder={destRel}
      />
      <div className="brain-field__acts">
        <button
          type="button"
          className="brain-act"
          disabled={!desktop || busy}
          onClick={() => void openFolder()}
        >
          папка
        </button>
        <button
          type="button"
          className="brain-act"
          disabled={!desktop || busy || disabled}
          onClick={() => void pickFile()}
        >
          {busy ? "конвертирую…" : "выбрать файл"}
        </button>
      </div>
    </div>
  );
}
