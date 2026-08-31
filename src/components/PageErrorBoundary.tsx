import { Component, type ErrorInfo, type ReactNode } from "react";

type PageErrorBoundaryProps = {
  /** Leaves the crashed page so the boundary remounts fresh on return. */
  onExit: () => void;
  children: ReactNode;
};

/**
 * A render crash inside one hub (canvas minigames, content pages, session)
 * must show a local, recoverable fallback — not eject the whole app to the
 * boot error screen. Remount via `key` on navigation resets the error state.
 */
export class PageErrorBoundary extends Component<
  PageErrorBoundaryProps,
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Page crash:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <div className="empty-state">
          <strong>Раздел упал с ошибкой</strong>
          <span>{this.state.error.message}</span>
          <button type="button" onClick={this.props.onExit}>
            Вернуться на главную
          </button>
          <button type="button" onClick={() => window.location.reload()}>
            Перезагрузить приложение
          </button>
        </div>
      </div>
    );
  }
}
