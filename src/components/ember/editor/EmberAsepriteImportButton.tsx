import { useRef } from "react";

type Props = {
  label: string;
  title?: string;
  className?: string;
  disabled?: boolean;
  onFile: (file: File) => void;
};

export function EmberAsepriteImportButton({
  label,
  title,
  className,
  disabled,
  onFile,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".aseprite,.ase,application/octet-stream"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
      <button
        type="button"
        className={className}
        title={title ?? "Импорт .aseprite"}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {label}
      </button>
    </>
  );
}
