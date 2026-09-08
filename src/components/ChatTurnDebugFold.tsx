import { useState } from "react";
import {
  formatSoulTurnDebugPrompt,
  formatSoulTurnDebugReport,
  type SoulTurnDebugSnapshot,
} from "../lib/soul/turnDebug";

type Props = {
  snapshot: SoulTurnDebugSnapshot;
  showPrompt: boolean;
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function CopyBtn({ label, text }: { label: string; text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="chat-turn-debug__copy"
      onClick={() => {
        void copyText(text).then((ok) => {
          if (!ok) return;
          setDone(true);
          window.setTimeout(() => setDone(false), 1400);
        });
      }}
    >
      {done ? "Скопировано" : label}
    </button>
  );
}

function mark(included: boolean): string {
  return included ? "✓" : "✗";
}

export function ChatTurnDebugFold({ snapshot, showPrompt }: Props) {
  const report = formatSoulTurnDebugReport(snapshot);
  const prompt = formatSoulTurnDebugPrompt(snapshot);
  const intent = snapshot.selectedIntent;
  return (
    <details className="chat-think chat-turn-debug">
      <summary>
        <span className="chat-think__label">Контекст хода</span>
      </summary>
      <div className="chat-think__body chat-turn-debug__body">
        <p className="chat-turn-debug__meta">
          Mode: {snapshot.conversation.mode}
          {" · "}Act: {snapshot.conversation.act}
          {" · "}Invitation: {snapshot.conversation.invitation}
          {snapshot.conversation.detectedSubjects.length
            ? ` · Subjects: ${snapshot.conversation.detectedSubjects.join(", ")}`
            : ""}
        </p>

        <p className="chat-turn-debug__h">Candidates</p>
        {snapshot.candidates.length === 0 ? (
          <p>none</p>
        ) : (
          <ul>
            {snapshot.candidates.map((row) => (
              <li key={row.id}>
                {row.kind}
                {" · "}
                {row.eligible ? "eligible" : "suppressed"}
                <span className="chat-turn-debug__reason"> — {row.reason}</span>
              </li>
            ))}
          </ul>
        )}
        {snapshot.context.notes.map((note) => (
          <p key={note} className="chat-turn-debug__note">
            {note}
          </p>
        ))}

        <p className="chat-turn-debug__h">Intent</p>
        {intent ? (
          <p>
            {intent.id ?? "live"} · included={intent.includedInPrompt ? "yes" : "no"}
            <span className="chat-turn-debug__reason"> — {intent.reason}</span>
          </p>
        ) : (
          <p>none</p>
        )}
        {snapshot.initiative ? (
          <p>
            consume: {snapshot.initiative.consumeReason}
            {snapshot.initiative.consumed ? " · consumed" : " · pending"}
          </p>
        ) : null}

        <p className="chat-turn-debug__h">Prompt</p>
        <ul className="chat-turn-debug__sections">
          {snapshot.context.sections.map((row) => (
            <li key={row.name}>
              {mark(row.included)} {row.name}
              {row.included
                ? ` ${row.chars ?? 0} chars`
                : row.reason
                  ? `  ${row.reason}`
                  : ""}
            </li>
          ))}
        </ul>
        <p>Total: {snapshot.context.totalChars} chars</p>

        <p className="chat-turn-debug__h">Model</p>
        <p>
          Chat: {snapshot.roles.chat}
          <br />
          Router: {snapshot.roles.router}
          <br />
          Extractor: {snapshot.roles.extractor}
          <br />
          Planner: {snapshot.roles.planner}
        </p>
        <p>
          role: chat
          {snapshot.model.preset ? ` · preset: ${snapshot.model.preset}` : ""}
        </p>
        <p>
          Router ran this turn: {snapshot.router?.ran ? "yes" : "no"}
          {" · "}
          Extractor ran this turn: {snapshot.extractor?.ran ? "yes" : "no"}
        </p>

        <p className="chat-turn-debug__h">Speech</p>
        <p>
          first attempt:{" "}
          {snapshot.speech.firstAttemptValid
            ? "ok"
            : snapshot.speech.firstAttemptReason ?? "fail"}
          {" · "}retry: {snapshot.speech.retryUsed ? "yes" : "no"}
          {snapshot.speech.repetitionScore != null
            ? ` · repeat score: ${snapshot.speech.repetitionScore.toFixed(2)}`
            : ""}
          {snapshot.speech.latencyMs != null
            ? ` · ${snapshot.speech.latencyMs} ms`
            : ""}
        </p>

        <p className="chat-turn-debug__h">Extractor</p>
        <p>
          ran: {snapshot.extractor?.ran ? "yes" : "no"}
          {" · "}hint:{" "}
          {snapshot.extractor?.speechHintDetected ? "yes" : "no"}
          {" · "}card: {snapshot.extractor?.cardEmitted ? "yes" : "no"}
          {snapshot.extractor?.retryUsed != null
            ? ` · retry: ${snapshot.extractor.retryUsed ? "yes" : "no"}`
            : ""}
          {snapshot.extractor?.latencyMs != null
            ? ` · ${snapshot.extractor.latencyMs} ms`
            : ""}
        </p>
        {snapshot.extractor?.firstAttemptValid === false ? (
          <p>
            {snapshot.extractor.retryUsed && snapshot.extractor.parsed === "valid"
              ? "attempt 1 invalid · attempt 2 valid"
              : "invalid after retry"}
          </p>
        ) : null}
        {snapshot.extractor?.proposals.map((row, i) => (
          <p key={`${row.kind}-${i}`}>
            {row.kind} · accepted={row.acceptedByValidator ? "yes" : "no"}
            {row.reason ? ` · ${row.reason}` : ""}
          </p>
        ))}

        {snapshot.router?.ran ? (
          <>
            <p className="chat-turn-debug__h">Router</p>
            <p>
              ran: yes
              {snapshot.router.messagesInBatch != null
                ? ` · messagesInBatch: ${snapshot.router.messagesInBatch}`
                : ""}
              {snapshot.router.parsed ? ` · ${snapshot.router.parsed}` : ""}
              {snapshot.router.retryUsed != null
                ? ` · retry: ${snapshot.router.retryUsed ? "yes" : "no"}`
                : ""}
              {snapshot.router.latencyMs != null
                ? ` · ${snapshot.router.latencyMs} ms`
                : ""}
            </p>
            {snapshot.router.firstAttemptValid === false ? (
              <p>
                {snapshot.router.retryUsed && snapshot.router.parsed !== "invalid"
                  ? "attempt 1 invalid · attempt 2 valid"
                  : "invalid after retry · patch rejected · state unchanged"}
              </p>
            ) : null}
            {snapshot.router.updates.map((line) => (
              <p key={line}>{line}</p>
            ))}
            {snapshot.router.rejected.map((line) => (
              <p key={line}>rejected: {line}</p>
            ))}
          </>
        ) : null}

        {snapshot.planner ? (
          <>
            <p className="chat-turn-debug__h">Planner</p>
            <p>
              source: {snapshot.planner.source}
              {snapshot.planner.model ? ` · ${snapshot.planner.model}` : ""}
              {snapshot.planner.retryUsed != null
                ? ` · retry: ${snapshot.planner.retryUsed ? "yes" : "no"}`
                : ""}
              {snapshot.planner.latencyMs != null
                ? ` · ${snapshot.planner.latencyMs} ms`
                : ""}
            </p>
            {snapshot.planner.fallbackReason ? (
              <p>{snapshot.planner.fallbackReason}</p>
            ) : null}
          </>
        ) : null}

        <p className="chat-turn-debug__h">Proposal lifecycle</p>
        {snapshot.proposalLifecycle?.length ? (
          snapshot.proposalLifecycle.map((row, index) => (
            <p key={`${row.proposalId}-${row.state}-${index}`}>
              {row.kind} · {row.state}
              {row.detail ? ` · ${row.detail}` : ""}
            </p>
          ))
        ) : (
          <p>none</p>
        )}

        <div className="chat-turn-debug__actions">
          <CopyBtn label="Копировать debug" text={report} />
          {showPrompt ? <CopyBtn label="Копировать prompt" text={prompt} /> : null}
        </div>

        {showPrompt ? (
          <details className="chat-turn-debug__prompt">
            <summary>Фактический prompt</summary>
            <pre>{prompt}</pre>
          </details>
        ) : null}
      </div>
    </details>
  );
}
