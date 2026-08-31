type PersistFailureListener = (message: string) => void;

const listeners = new Set<PersistFailureListener>();

/**
 * Storage savers swallow quota/IO errors to keep the app alive (a throw here
 * would blank the UI), but earned progress vanishing must be visible: savers
 * report here and the app shell shows one dismissible banner.
 */
export function reportPersistFailure(what: string): void {
  const message = `Не удалось сохранить ${what} — хранилище переполнено или недоступно.`;
  console.warn(message);
  for (const listener of listeners) listener(message);
}

export function subscribePersistFailure(
  listener: PersistFailureListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
