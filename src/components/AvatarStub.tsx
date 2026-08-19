import type { AvatarSnapshot } from "../lib/avatar/debugAvatar";

interface AvatarStubProps {
  snap: AvatarSnapshot | null;
}

/** Compact Phase 2 slot — emotion/gesture from bus; later replaced by 3D canvas. */
export function AvatarStub({ snap }: AvatarStubProps) {
  if (!snap || (!snap.lastSpeech && snap.emotion === "neutral")) return null;

  return (
    <aside className="avatar-stub" aria-label="Avatar stub">
      <div className="avatar-stub__meta">
        <span className="avatar-stub__emotion">{snap.emotion}</span>
        {snap.gesture ? (
          <span className="avatar-stub__gesture">{snap.gesture}</span>
        ) : null}
      </div>
      {snap.lastSpeech ? (
        <p className="avatar-stub__line">{snap.lastSpeech}</p>
      ) : null}
    </aside>
  );
}
