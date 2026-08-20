import { useRef, useState, type ReactNode } from "react";
import { BrainPanel } from "../components/BrainPanel";
import { GameplayPanel } from "../components/GameplayPanel";
import { SettingsSection } from "../components/SettingsSection";
import { SettingsTabs, type SettingsTab } from "../components/SettingsTabs";
import { TtsSettingsPanel } from "../components/TtsSettingsPanel";
import { functions, patterns } from "../lib/catalog";
import type { ContentUnlockLists } from "../lib/contentUnlocks";
import { GOAL_LABELS } from "../lib/labels";
import type { MediaSettings } from "../lib/media";
import { getActiveMistress } from "../lib/mistress";
import {
  applyProgressBackup,
  collectProgressBackup,
  downloadProgressBackupJson,
  readProgressBackupFile,
} from "../lib/progressBackup";
import {
  loadRouletteSettings,
  type RouletteSettings,
} from "../lib/rouletteSettings";
import {
  getActiveSaveSlot,
  resetSandboxSlot,
  SAVE_SLOT_LABELS,
  switchSaveSlot,
  type SaveSlotId,
} from "../lib/saveSlots";
import { reopenEveningRoute } from "../lib/eveningRoute";
import { reopenAllSectionBriefings } from "../lib/sectionBriefings";
import type { Block } from "../lib/types";
import type { SpeechTts } from "../lib/voice/speechTts";
import type { VoiceSettings } from "../lib/voiceSettings";
import { emptyWallet } from "../lib/wallet";

interface SettingsPageProps {
  queue: Block[];
  media: MediaSettings;
  unlockNotice?: string | null;
  onDismissUnlockNotice?: () => void;
  unlocks?: ContentUnlockLists;
  voice: VoiceSettings;
  voiceStatus: string | null;
  onMedia: (next: MediaSettings) => void;
  onExport: () => void;
  onVoice: (next: VoiceSettings) => void;
  onTestVoice: () => void;
  onSaveMedia: () => void;
  mediaSaveStatus: string | null;
  tts: SpeechTts;
  /** Disable slot switch while a session is running. */
  sessionLive?: boolean;
  /** Re-open first-run «вечерний маршрут». */
  onOpenEveningRoute?: () => void;
  /** After resetting section tips — parent may re-show the active section briefing. */
  onResetSectionBriefings?: () => void;
}

export function SettingsPage({
  queue,
  media,
  unlockNotice = null,
  onDismissUnlockNotice,
  unlocks = { ...emptyWallet().unlocks, pendingShopTags: [] },
  voice,
  voiceStatus,
  onMedia,
  onExport,
  onVoice,
  onTestVoice,
  onSaveMedia,
  mediaSaveStatus,
  tts,
  sessionLive = false,
  onOpenEveningRoute,
  onResetSectionBriefings,
}: SettingsPageProps) {
  const [rouletteSettings, setRouletteSettings] = useState<RouletteSettings>(
    () => loadRouletteSettings(),
  );
  const [activeSlot, setActiveSlot] = useState<SaveSlotId>(() =>
    getActiveSaveSlot(),
  );
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  function handleSlot(to: SaveSlotId) {
    if (to === activeSlot || sessionLive) return;
    setActiveSlot(to);
    switchSaveSlot(to);
  }

  async function handleExportProgress() {
    if (backupBusy || sessionLive) return;
    setBackupBusy(true);
    setBackupStatus(null);
    try {
      const payload = await collectProgressBackup({ includeFavorites: true });
      downloadProgressBackupJson(payload);
      const favN = payload.favorites?.length ?? 0;
      const favLine =
        payload.favorites == null
          ? payload.favoritesNote ?? "избранное не включено"
          : `избранное: ${favN}`;
      setBackupStatus(`Экспорт готов · слот «${payload.activeSlot}» · ${favLine}`);
    } catch (err) {
      setBackupStatus(
        err instanceof Error
          ? `Ошибка экспорта: ${err.message}`
          : "Ошибка экспорта",
      );
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleImportProgressFile(file: File | null) {
    if (!file || backupBusy || sessionLive) return;
    const ok = window.confirm(
      "Импорт прогресса полностью заменит текущий прогресс (кошелёк, дневник, ачивки, контракты, слоты live/sandbox и избранное из файла, если оно есть). Общие настройки (Gelbooru, голос, рулетка) не трогаются. Продолжить?",
    );
    if (!ok) {
      if (importInputRef.current) importInputRef.current.value = "";
      return;
    }
    setBackupBusy(true);
    setBackupStatus(null);
    try {
      const parsed = await readProgressBackupFile(file);
      if (!parsed.ok) {
        setBackupStatus(`Импорт отклонён: ${parsed.error}`);
        return;
      }
      const result = await applyProgressBackup(parsed.data, {
        applyFavorites: true,
      });
      const favLine = result.favoritesApplied
        ? `избранное: ${result.favoritesCount}`
        : "избранное без изменений";
      setBackupStatus(
        `Импорт ок · перезагрузка… (${favLine})`,
      );
      window.setTimeout(() => {
        window.location.reload();
      }, 400);
    } catch (err) {
      setBackupStatus(
        err instanceof Error
          ? `Ошибка импорта: ${err.message}`
          : "Ошибка импорта",
      );
      setBackupBusy(false);
    }
  }

  return (
    <div className="today settings-page">
      <header className="today__header">
        <div>
          <p className="today__eyebrow">Система</p>
          <h1 className="today__title">Настройки</h1>
          <p className="today__sub">
            ИИ пишет реплики. Голос их произносит. Gelbooru, геймплей и отладка
            — отдельные вкладки.
          </p>
        </div>
        <div className="today__cta">
          <button type="button" className="btn-ghost" onClick={onExport}>
            Export JSON
          </button>
        </div>
      </header>

      {unlockNotice ? (
        <div className="today__unlock-notice" role="status">
          <p>{unlockNotice}</p>
          {onDismissUnlockNotice ? (
            <button
              type="button"
              className="today__unlock-notice-dismiss"
              onClick={onDismissUnlockNotice}
            >
              Понятно
            </button>
          ) : null}
        </div>
      ) : null}

      <SettingsTabs
        tabs={[
          { id: "profile", label: "Профиль", hint: "Слоты и бэкапы" },
          { id: "brain", label: "ИИ ресурсы", hint: "LLM · TTS веса · что говорит" },
          { id: "voice", label: "Голос", hint: "озвучка · как звучит" },
          { id: "media", label: "Медиа", hint: "Ключи Gelbooru" },
          { id: "gameplay", label: "Геймплей", hint: "Рулетка, игрушка, CBT" },
          { id: "debug", label: "Отладка", hint: "Очередь блоков" },
        ] satisfies SettingsTab[]}
      >
        {/* ===== Профиль ===== */}
        <div className="settings-tab__panel">
        <SettingsSection
          id="saves"
          title="Сохранения"
          wide
          className="settings-page__saves"
          sub="Живой — настоящий прогресс. Песочница — всё открыто для тестов (редактор очереди сессии только здесь). Ключи Gelbooru, голос и рулетка общие. Смена слота перезагружает окно."
        >
          <div className="save-slots" role="group" aria-label="Слот сохранения">
            {(["live", "sandbox"] as const).map((id) => {
              const meta = SAVE_SLOT_LABELS[id];
              const active = activeSlot === id;
              return (
                <button
                  key={id}
                  type="button"
                  className={`save-slots__btn${active ? " is-active" : ""}`}
                  disabled={sessionLive}
                  onClick={() => handleSlot(id)}
                  aria-pressed={active}
                >
                  <span className="save-slots__title">{meta.titleRu}</span>
                  <span className="save-slots__blurb">{meta.blurbRu}</span>
                </button>
              );
            })}
          </div>
          {sessionLive ? (
            <p className="card__sub save-slots__warn">
              Сначала заверши или прерви сессию — потом можно сменить слот.
            </p>
          ) : null}
          {activeSlot === "sandbox" ? (
            <div className="today__actions save-slots__actions">
              <button
                type="button"
                className="btn-ghost"
                disabled={sessionLive}
                onClick={() => {
                  if (
                    !window.confirm(
                      "Сбросить песочницу до «всё открыто»? Прогресс в этом слоте обнулится.",
                    )
                  ) {
                    return;
                  }
                  resetSandboxSlot();
                }}
              >
                Сбросить песочницу
              </button>
            </div>
          ) : null}

          {onOpenEveningRoute || onResetSectionBriefings ? (
            <div className="today__actions save-slots__actions">
              {onOpenEveningRoute ? (
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={sessionLive}
                  onClick={() => {
                    reopenEveningRoute();
                    onOpenEveningRoute();
                  }}
                  title="Короткий гид: Госпожа → «Сегодня» → рулетка"
                >
                  Вечерний маршрут
                </button>
              ) : null}
              {onResetSectionBriefings ? (
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={sessionLive}
                  onClick={() => {
                    reopenAllSectionBriefings();
                    onResetSectionBriefings();
                  }}
                  title="Снова показывать короткие подсказки при входе в разделы"
                >
                  Подсказки разделов
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="save-backup">
            <p className="card__sub save-backup__blurb">
              Полный бэкап прогресса для переноса на другой ПК: кошелёк, дневник,
              ачивки, контракты, таймеры, оба слота и избранное (IndexedDB).
              Настройки Gelbooru / голос / рулетка в файл не входят.
            </p>
            <div className="today__actions save-backup__actions">
              <button
                type="button"
                className="btn-primary"
                disabled={sessionLive || backupBusy}
                onClick={() => void handleExportProgress()}
              >
                Экспорт прогресса
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={sessionLive || backupBusy}
                onClick={() => importInputRef.current?.click()}
              >
                Импорт прогресса
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  void handleImportProgressFile(file);
                  e.target.value = "";
                }}
              />
            </div>
            {backupStatus ? (
              <p className="card__sub save-backup__status" role="status">
                {backupStatus}
              </p>
            ) : null}
            {sessionLive ? (
              <p className="card__sub save-slots__warn">
                Экспорт / импорт прогресса недоступны во время сессии.
              </p>
            ) : null}
          </div>
        </SettingsSection>
        </div>

        {/* ===== ИИ ресурсы ===== */}
        <div className="settings-tab__panel">
        <SettingsSection
          id="brain"
          title="ИИ ресурсы"
          wide
          sub="Модели на диске: скачать, выбрать, удалить. Как звучит — вкладка «Голос»."
        >
          <BrainPanel
            voice={voice}
            onVoice={onVoice}
            voiceStatus={voiceStatus}
            onTestVoice={onTestVoice}
          />
        </SettingsSection>
        </div>

        {/* ===== Голос ===== */}
        <div className="settings-tab__panel">
        <SettingsSection
          id="voice"
          title={`Голос · ${getActiveMistress().displayNameRu}`}
          wide
          sub="Движки со стартом и настройками. Веса Piper/Qwen — вкладка «ИИ ресурсы»."
        >
          <TtsSettingsPanel voice={voice} onVoice={onVoice} tts={tts} />
        </SettingsSection>
        </div>

        {/* ===== Медиа ===== */}
        <div className="settings-tab__panel">
        <SettingsSection
          id="gelbooru"
          title="Gelbooru · ключи"
          sub="Credentials для API. Теги и плейлист настраиваются на Рулетке."
        >
          <Field
            label="User ID"
            hint="Account → Options → API Access Credentials (не логин)"
          >
            <input
              value={media.gelbooruUserId}
              onChange={(e) =>
                onMedia({ ...media, gelbooruUserId: e.target.value })
              }
              placeholder="123456"
              autoComplete="off"
            />
          </Field>
          <Field
            label="API Key"
            hint="Тот же блок на gelbooru.com — ключ хранится только локально"
          >
            <input
              type="password"
              value={media.gelbooruApiKey}
              onChange={(e) =>
                onMedia({ ...media, gelbooruApiKey: e.target.value })
              }
              placeholder="api_key"
              autoComplete="off"
            />
          </Field>
          <p className="card__sub">
            Ключи:{" "}
            <a
              href="https://gelbooru.com/index.php?page=account&s=options"
              target="_blank"
              rel="noreferrer"
            >
              gelbooru.com → Account → Options
            </a>
            . В каждый запрос уходят <code>user_id</code> +{" "}
            <code>api_key</code>. Лимит аккаунта:{" "}
            <strong>10 запросов / 1 сек</strong> — клиент сам ждёт слот.
          </p>
          <div className="today__actions">
            <button type="button" className="btn-primary" onClick={onSaveMedia}>
              Сохранить ключи
            </button>
            {mediaSaveStatus ? (
              <span className="voice-status">{mediaSaveStatus}</span>
            ) : null}
          </div>
        </SettingsSection>
        </div>

        {/* ===== Геймплей ===== */}
        <div className="settings-tab__panel">
        <SettingsSection
          id="gameplay"
          title="Геймплей"
          wide
          sub="Рулетка, типы тегов, проверка CBT/plapping и игрушка."
        >
          <GameplayPanel
            settings={rouletteSettings}
            onChange={setRouletteSettings}
            unlocks={unlocks}
          />
        </SettingsSection>
        </div>

        {/* ===== Отладка ===== */}
        <div className="settings-tab__panel">
        <SettingsSection
          id="debug-queue"
          title={`Отладка · очередь блоков (${queue.length})`}
          wide
          defaultOpen={true}
          className="settings-page__debug"
        >
          <ol className="queue">
            {queue.slice(0, 12).map((b, i) => {
              const fn = functions.find((f) => f.id === b.functionId);
              const pat = patterns.find((p) => p.id === b.patternId);
              return (
                <li key={b.id} className="queue__item">
                  <strong>
                    #{i + 1} · {GOAL_LABELS[b.goal].nameRu}
                  </strong>{" "}
                  — {fn?.nameRu} · {pat?.nameRu} ·{" "}
                  {b.drive === "vibe"
                    ? `вибро ${b.vibeProfileId ?? "профиль"}`
                    : `${b.bpm} BPM`}{" "}
                  · {b.durationSec}с
                </li>
              );
            })}
            {queue.length > 12 ? (
              <li className="queue__item">… и ещё {queue.length - 12}</li>
            ) : null}
          </ol>
        </SettingsSection>
        </div>
      </SettingsTabs>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <label className="field" title={hint}>
      <span className="field__label">{label}</span>
      <span className="field__hint">{hint}</span>
      {children}
    </label>
  );
}
