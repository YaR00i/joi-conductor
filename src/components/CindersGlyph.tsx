/**
 * Shared "cinder/ember" glyph (the same flame used for the Cinders currency in
 * the Session UI). Extracted from SessionShopStrip so other sections can reuse
 * it instead of emoji.
 */
export function CindersGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <defs>
        <radialGradient id="cinder-core" cx="45%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#ffe0a8" />
          <stop offset="45%" stopColor="#ff8a4a" />
          <stop offset="100%" stopColor="#7a2410" />
        </radialGradient>
      </defs>
      <path
        d="M12 2.8c1.4 2.2 2.1 4 2.1 5.6 0 1.7-1 3-2.1 3-1.2 0-2.1-1.3-2.1-3 0-1.6.7-3.4 2.1-5.6Z"
        fill="url(#cinder-core)"
        opacity="0.95"
      />
      <path
        d="M7.2 9.2c1.8 1.1 2.9 2.4 3.2 4 .3 1.6-.5 3-1.6 3.4-1.2.4-2.5-.6-2.9-2.2-.4-1.6.1-3.6 1.3-5.2Z"
        fill="#ff6a35"
        opacity="0.9"
      />
      <path
        d="M16.8 9.2c-1.8 1.1-2.9 2.4-3.2 4-.3 1.6.5 3 1.6 3.4 1.2.4 2.5-.6 2.9-2.2.4-1.6-.1-3.6-1.3-5.2Z"
        fill="#ff9a55"
        opacity="0.85"
      />
      <ellipse cx="12" cy="18.4" rx="6.2" ry="2.4" fill="#3a1510" opacity="0.55" />
      <path
        d="M8.4 15.2c1.1 1.6 2.3 2.5 3.6 2.5s2.5-.9 3.6-2.5c-1 .9-2.2 1.4-3.6 1.4s-2.6-.5-3.6-1.4Z"
        fill="#ffb070"
        opacity="0.75"
      />
    </svg>
  );
}
