export type PixelToolIconName =
  | "marquee"
  | "lasso"
  | "wand"
  | "line"
  | "rect"
  | "ellipse"
  | "fill"
  | "brush"
  | "glow"
  | "shine"
  | "eyedropper"
  | "hand"
  | "navigator"
  | "undo"
  | "redo"
  | "copy"
  | "paste"
  | "clear"
  | "flipX"
  | "flipY"
  | "rotate"
  | "cut"
  | "duplicate"
  | "selectAll"
  | "invert"
  | "fit";

export function PixelToolIcon({ name }: { name: PixelToolIconName }) {
  const body = (() => {
    switch (name) {
      case "marquee": return <rect x="3" y="4" width="14" height="12" rx="1" strokeDasharray="2 2" />;
      case "lasso": return <path d="M4 5c8-4 14 0 12 5-1.2 3-6 4-9 2-2-1.4-1-4 .5-4.8 1.8-1 4 .4 3.5 2.2-.5 1.9-2.8 2.4-4.3 1.4" />;
      case "wand": return <><path d="m4 16 8-8" /><path d="m10 4 1-2m4 5 2-1m-2 6 2 1M6 8 4 7" /></>;
      case "line": return <path d="M4 16 16 4" />;
      case "rect": return <rect x="3.5" y="4" width="13" height="12" rx="1" />;
      case "ellipse": return <ellipse cx="10" cy="10" rx="7" ry="5.5" />;
      case "fill": return <><path d="m5 4 7 7-5 5-4-4 7-7" /><path d="M13 14h4m-2-2v4" /></>;
      case "brush": return <><path d="m12 3 5 5-7 7-5-5z" /><path d="M8 14c-1 3-3 3-5 3 1-1 1-3 2-4" /></>;
      case "glow": return <path d="m10 2 1.6 5.2L17 9l-5.4 1.8L10 16l-1.6-5.2L3 9l5.4-1.8z" />;
      case "shine": return <><path d="m10 3 3 6-3 6-3-6z" /><path d="M3 4v3M1.5 5.5h3" /></>;
      case "eyedropper": return <><path d="m12 3 5 5-8 8H4v-5z" /><path d="m10 5 5 5" /></>;
      case "hand": return <path d="M5 10V6a1 1 0 0 1 2 0v3-5a1 1 0 0 1 2 0v5-6a1 1 0 0 1 2 0v6-4a1 1 0 0 1 2 0v5l1-2c1-1 3 0 2 2l-3 6H8c-3-1-5-3-5-6a1 1 0 0 1 2 0z" />;
      case "navigator": return <><rect x="2.5" y="3.5" width="15" height="13" rx="1" /><rect x="7" y="7" width="6" height="5" /></>;
      case "undo": return <><path d="M7 6 3 9l4 3" /><path d="M4 9h7c4 0 5 5 2 7" /></>;
      case "redo": return <><path d="m13 6 4 3-4 3" /><path d="M16 9H9c-4 0-5 5-2 7" /></>;
      case "copy": return <><rect x="6" y="6" width="10" height="10" rx="1" /><path d="M4 13H3V3h10v1" /></>;
      case "paste": return <><path d="M7 5H4v12h12V5h-3" /><rect x="7" y="2" width="6" height="5" rx="1" /></>;
      case "clear": return <><path d="M5 6h10m-8-2h6m-7 2 1 11h6l1-11" /><path d="M9 9v5m2-5v5" /></>;
      case "flipX": return <><path d="M10 3v14" strokeDasharray="2 2" /><path d="m7 6-4 4 4 4m6-8 4 4-4 4" /></>;
      case "flipY": return <><path d="M3 10h14" strokeDasharray="2 2" /><path d="m6 7 4-4 4 4m-8 6 4 4 4-4" /></>;
      case "rotate": return <><path d="M15 7V3h-4" /><path d="M15 4a7 7 0 1 0 1 9" /></>;
      case "cut": return <><circle cx="5" cy="15" r="2" /><circle cx="15" cy="15" r="2" /><path d="m6.5 13.5 7-10M13.5 13.5l-7-10" /></>;
      case "duplicate": return <><rect x="3" y="3" width="10" height="10" rx="1" /><rect x="7" y="7" width="10" height="10" rx="1" /></>;
      case "selectAll": return <><path d="M3 7V3h4m6 0h4v4m0 6v4h-4m-6 0H3v-4" /><rect x="7" y="7" width="6" height="6" strokeDasharray="2 2" /></>;
      case "invert": return <><circle cx="10" cy="10" r="7" /><path d="M10 3a7 7 0 0 0 0 14z" fill="currentColor" stroke="none" /></>;
      case "fit": return <path d="M3 8V3h5m4 0h5v5m0 4v5h-5m-4 0H3v-5" />;
    }
  })();

  return (
    <svg className="ember-pixel-tool-icon" viewBox="0 0 20 20" aria-hidden="true">
      {body}
    </svg>
  );
}
