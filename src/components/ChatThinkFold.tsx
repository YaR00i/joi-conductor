type Props = {
  text: string;
};

/** Cursor-style fold: thoughts sit above the spoken bubble. */
export function ChatThinkFold({ text }: Props) {
  const body = text.trim();
  if (!body) return null;
  return (
    <details className="chat-think">
      <summary>
        <span className="chat-think__label">Мысли</span>
      </summary>
      <div className="chat-think__body">{body}</div>
    </details>
  );
}
