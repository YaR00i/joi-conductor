import { useEffect, useState } from "react";
import { getActiveMistress, subscribeActiveMistress } from "../lib/mistress";
import {
  CONTROL_CHANGED_EVENT,
  controlLiveSnapshot,
  loadControlState,
} from "../lib/soul/control";

/** Titlebar / chat badge: overdue check-in ("she is waiting for a report"). */
export function CheckInPill() {
  const [overdue, setOverdue] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    const sync = () => {
      const id = getActiveMistress().id;
      const live = controlLiveSnapshot(loadControlState(id));
      const state = loadControlState(id);
      setOverdue(
        live.checkInOverdue || state.dispatch.phase === "morning",
      );
      setNote(live.checkIn?.note ?? "");
    };
    sync();
    const id = window.setInterval(sync, 15_000);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "joi-soul-control-v1") sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(CONTROL_CHANGED_EVENT, sync);
    const unsub = subscribeActiveMistress(() => sync());
    return () => {
      window.clearInterval(id);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CONTROL_CHANGED_EVENT, sync);
      unsub();
    };
  }, []);

  if (!overdue) return null;

  return (
    <div
      className="checkin-pill"
      title={note || "Она ждёт отчёт"}
    >
      <span className="checkin-pill__dot" aria-hidden />
      <span>она ждёт отчёт</span>
    </div>
  );
}

export function chatCheckInOverdue(): boolean {
  const id = getActiveMistress().id;
  const state = loadControlState(id);
  const live = controlLiveSnapshot(state);
  return live.checkInOverdue || state.dispatch.phase === "morning";
}
