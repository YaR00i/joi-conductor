import { useEffect, useState } from "react";
import { MediaCensorOnOffSeg } from "./MediaCensorToggle";
import { getActiveMistress, subscribeActiveMistress } from "../lib/mistress";
import {
  cloneSessionFxCaptions,
  formatSessionFxCaptionLines,
  loadSessionFxSettings,
  parseSessionFxCaptionLines,
  patchSessionFxSettings,
  pickSessionFxCaption,
  sessionFxThemeLabelRu,
  sessionFxThemeSubRu,
  SESSION_FX_CAPTIONS,
  SESSION_FX_THEMES,
  subscribeSessionFx,
  type SessionFxSettings,
  type SessionFxTheme,
} from "../lib/sessionFx";
import "./sessionFx.css";

function FxPhraseField({
  theme,
  lines,
  onCommit,
}: {
  theme: SessionFxTheme;
  lines: readonly string[];
  onCommit: (next: string[]) => void;
}) {
  const [text, setText] = useState(() => formatSessionFxCaptionLines(lines));

  useEffect(() => {
    setText(formatSessionFxCaptionLines(lines));
  }, [lines]);

  return (
    <div className="brain-field session-fx-phrases__field">
      <span className="session-fx-phrases__head">
        <span className="field__label" id={`fx-phrases-${theme}`}>
          {sessionFxThemeLabelRu(theme)}
        </span>
        <button
          type="button"
          className="brain-act"
          onClick={() => {
            const factory = [...SESSION_FX_CAPTIONS[theme]];
            setText(formatSessionFxCaptionLines(factory));
            onCommit(factory);
          }}
        >
          сбросить
        </button>
      </span>
      <textarea
        rows={Math.min(12, Math.max(8, lines.length + 1))}
        spellCheck={false}
        value={text}
        aria-labelledby={`fx-phrases-${theme}`}
        onChange={(e) => setText(e.target.value)}
        onBlur={() =>
          onCommit(parseSessionFxCaptionLines(text, SESSION_FX_CAPTIONS[theme]))
        }
      />
    </div>
  );
}

function FxToggle({
  label,
  hint,
  value,
  onSub,
  offSub,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onSub: string;
  offSub: string;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="session-fx-row">
      <div className="session-fx-row__copy">
        <span className="field__label">{label}</span>
        {hint ? <span className="field__hint">{hint}</span> : null}
      </div>
      <MediaCensorOnOffSeg
        ariaLabel={label}
        value={value}
        onSub={onSub}
        offSub={offSub}
        onChange={onChange}
      />
    </div>
  );
}

export function SessionFxPanel() {
  const [fx, setFx] = useState<SessionFxSettings>(() => loadSessionFxSettings());
  const [mistressName, setMistressName] = useState(
    () => getActiveMistress().displayNameRu,
  );
  const [isSparkle, setIsSparkle] = useState(
    () => getActiveMistress().id === "sparkle",
  );
  const [previewSalt, setPreviewSalt] = useState(0);

  useEffect(() => subscribeSessionFx(() => setFx(loadSessionFxSettings())), []);
  useEffect(
    () =>
      subscribeActiveMistress((p) => {
        setMistressName(p.displayNameRu);
        setIsSparkle(p.id === "sparkle");
      }),
    [],
  );

  function patch(next: Partial<SessionFxSettings>) {
    setFx(patchSessionFxSettings(next));
  }

  return (
    <div className="session-fx-panel">
      <p className="brain-panel__hint">
        Безумные слои поверх сессии Искорки: гипноспираль, артефакты, манты.
        Сейчас госпожа — {mistressName}
        {isSparkle ? ". Эффекты живые." : ". В сессии Искры включатся сами."}
      </p>
      <div className="session-fx-layers">
        <div className="session-fx-row">
          <div className="session-fx-row__copy">
            <span className="field__label">Эффекты</span>
            <span className="field__hint">Главный рубильник слоёв Искорки.</span>
          </div>
          <MediaCensorOnOffSeg
            ariaLabel="Эффекты сессии"
            value={fx.enabled}
            onSub="Искорка"
            offSub="тихо"
            onChange={(on) => patch({ enabled: on })}
          />
        </div>
        <FxToggle
          label="Мешать темы"
          hint="Надписи скачут по всем колодам, не только выбранной."
          value={fx.mixCaptions}
          onSub="каша"
          offSub="одна тема"
          onChange={(on) => patch({ mixCaptions: on })}
        />
      </div>
      <div className="session-fx-block">
        <span className="field__label">Тема надписей</span>
        <span className="field__hint">Колода мантр и всплывашек.</span>
        <div
          className="session-fx-themes"
          role="radiogroup"
          aria-label="Тема эффектов"
        >
          {SESSION_FX_THEMES.map((id: SessionFxTheme) => {
            const on = id === fx.theme;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={on}
                className={"session-fx-themes__btn" + (on ? " is-on" : "")}
                onClick={() => patch({ theme: id })}
              >
                <strong>{sessionFxThemeLabelRu(id)}</strong>
                <span>{sessionFxThemeSubRu(id)}</span>
              </button>
            );
          })}
        </div>
      </div>
      <label className="brain-field session-fx-gain">
        <span className="field__label">Сила · {fx.intensity}</span>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={fx.intensity}
          onChange={(e) => patch({ intensity: Number(e.target.value) })}
        />
        <span className="field__hint">Громче спираль, чаще надписи.</span>
      </label>
      <div className="session-fx-layers">
        <FxToggle
          label="Гипноз"
          hint="Спираль и кольца, как фильтры HotScreen."
          value={fx.hypno}
          onSub="спираль"
          offSub="без"
          onChange={(on) => patch({ hypno: on })}
        />
        <FxToggle
          label="Артефакты"
          hint="Полоски плёнки, зерно, бегущая полоса трекинга."
          value={fx.artifacts}
          onSub="VHS"
          offSub="чисто"
          onChange={(on) => patch({ artifacts: on })}
        />
        <FxToggle
          label="Мантра"
          hint="Крупная фраза по центру кадра."
          value={fx.captions}
          onSub="центр"
          offSub="без"
          onChange={(on) => patch({ captions: on })}
        />
        <FxToggle
          label="Всплывашки"
          hint="Мелкие слова в случайных местах."
          value={fx.popups}
          onSub="сыпать"
          offSub="без"
          onChange={(on) => patch({ popups: on })}
        />
        <FxToggle
          label="Глитч"
          hint="Рваные полосы и красно-синий сдвиг, как сбой сигнала."
          value={fx.glitch}
          onSub="сбой"
          offSub="ровно"
          onChange={(on) => patch({ glitch: on })}
        />
        <FxToggle
          label="Вспышки"
          hint="Может укачать. По умолчанию выкл."
          value={fx.pulse}
          onSub="осторожно"
          offSub="спокойно"
          onChange={(on) => patch({ pulse: on })}
        />
        <FxToggle
          label="Плашка на аватаре"
          value={fx.avatarBar}
          onSub="закрыто"
          offSub="лицо"
          onChange={(on) => patch({ avatarBar: on })}
        />
      </div>
      {fx.captions || fx.popups ? (
        <div className="session-fx-preview">
          <span className="session-fx-preview__sample">
            {pickSessionFxCaption(fx, previewSalt)}
          </span>
          <button
            type="button"
            className="brain-act"
            onClick={() => setPreviewSalt((n) => n + 1)}
          >
            другая фраза
          </button>
        </div>
      ) : null}
      <div className="session-fx-block">
        <span className="field__label">Фразы</span>
        <span className="field__hint">
          Одна строка — одна надпись. Клик вне поля сохраняет. Пустой список
          вернёт заводские фразы этой темы.
        </span>
      </div>
      <div className="session-fx-phrases">
        {SESSION_FX_THEMES.map((theme) => (
          <FxPhraseField
            key={theme}
            theme={theme}
            lines={fx.captionsByTheme[theme]}
            onCommit={(next) =>
              patch({
                captionsByTheme: { ...fx.captionsByTheme, [theme]: next },
              })
            }
          />
        ))}
      </div>
      <button
        type="button"
        className="brain-act"
        onClick={() => patch({ captionsByTheme: cloneSessionFxCaptions() })}
      >
        сбросить все фразы
      </button>
    </div>
  );
}
