import { useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  className?: string;
  title?: string;
  disabled?: boolean;
  onPreview?: (hex: string) => void;
  onCommit: (hex: string) => void;
};

/**
 * Native color pickers emit many `input` events while the cursor moves and one
 * `change` event when the picker is accepted. Keep those paths separate so a
 * live preview does not create model snapshots or remesh voxel geometry.
 */
export function DeferredColorInput({
  value,
  className,
  title,
  disabled,
  onPreview,
  onCommit,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef(value);
  const lastCommittedRef = useRef(value);
  const previewRef = useRef(onPreview);
  const commitRef = useRef(onCommit);
  const [draft, setDraft] = useState(value);

  valueRef.current = value;
  previewRef.current = onPreview;
  commitRef.current = onCommit;

  useEffect(() => {
    setDraft(value);
    lastCommittedRef.current = value;
  }, [value]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const commitOnce = (next: string) => {
      if (next === lastCommittedRef.current) return;
      lastCommittedRef.current = next;
      commitRef.current(next);
    };

    const commitNativeChange = () => {
      const next = input.value;
      setDraft(next);
      previewRef.current?.(next);
      if (next !== valueRef.current) commitOnce(next);
    };

    input.addEventListener("change", commitNativeChange);
    return () => input.removeEventListener("change", commitNativeChange);
  }, []);

  return (
    <input
      ref={inputRef}
      type="color"
      className={className}
      title={title}
      disabled={disabled}
      value={draft.startsWith("#") ? draft : "#888888"}
      onChange={() => {
        // React maps onChange to the native live input event for color fields.
        // The native `change` listener above performs the single commit.
      }}
      onInput={(event) => {
        const next = (event.target as HTMLInputElement).value;
        setDraft(next);
        previewRef.current?.(next);
      }}
      onBlur={() => {
        // Some platform pickers do not dispatch native change. Blur is a safe
        // fallback and remains idempotent after the normal change event.
        const next = inputRef.current?.value ?? draft;
        if (next !== valueRef.current && next !== lastCommittedRef.current) {
          lastCommittedRef.current = next;
          commitRef.current(next);
        }
      }}
    />
  );
}
