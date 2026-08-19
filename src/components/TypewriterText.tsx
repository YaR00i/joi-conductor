import { useEffect, useState } from "react";

type Props = {
  text: string;
  /** ms per character */
  charMs?: number;
  className?: string;
};

/** Reveals `text` one character at a time (caption typewriter). */
export function TypewriterText({ text, charMs = 28, className }: Props) {
  const [shown, setShown] = useState("");

  useEffect(() => {
    setShown("");
    if (!text) return;
    let i = 0;
    let cancelled = false;
    const id = window.setInterval(() => {
      if (cancelled) return;
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) {
        window.clearInterval(id);
      }
    }, Math.max(12, charMs));
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [text, charMs]);

  return (
    <span className={className}>
      {shown}
      {shown.length < text.length ? (
        <span className="typewriter-caret" aria-hidden>
          ▍
        </span>
      ) : null}
    </span>
  );
}
