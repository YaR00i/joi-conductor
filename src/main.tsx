import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

class BootErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Boot crash:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            padding: "2rem",
            background: "#1a1210",
            color: "#ffe8dc",
            fontFamily: "system-ui, sans-serif",
            whiteSpace: "pre-wrap",
          }}
        >
          <h1 style={{ marginTop: 0 }}>Ошибка запуска</h1>
          <p>{this.state.error.message}</p>
          <pre style={{ opacity: 0.75, fontSize: 12 }}>
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = document.getElementById("root");
if (!root) {
  document.body.textContent = "Нет #root";
} else {
  createRoot(root).render(
    <StrictMode>
      <BootErrorBoundary>
        <App />
      </BootErrorBoundary>
    </StrictMode>,
  );
}
