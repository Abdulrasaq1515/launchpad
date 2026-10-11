"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
    if (typeof window !== "undefined") {
      interface ToastBridge {
        show: (t: { title: string; message?: string; variant?: string; duration?: number }) => string;
      }
      const bridge = (window as unknown as { __soropadToast?: ToastBridge }).__soropadToast;
      bridge?.show({
        title: "Something went wrong",
        message: error.message,
        variant: "error",
      });
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }
      return <DefaultErrorFallback error={this.state.error} onReset={this.reset} />;
    }
    return this.props.children;
  }
}

function DefaultErrorFallback({
  error,
  onReset,
}: {
  error: Error;
  onReset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="rounded-full bg-danger-soft p-3 text-danger">
        <AlertTriangle className="h-8 w-8" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold text-ink">
          Something went wrong
        </h2>
        <p className="max-w-md text-sm text-muted">
          {error.message ||
            "An unexpected error occurred. The page failed to render."}
        </p>
      </div>
      <button
        type="button"
        onClick={onReset}
        className="inline-flex items-center gap-2 rounded-lg border border-line bg-sunken px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-info/30 hover:bg-info-soft hover:text-info"
      >
        <RotateCcw className="h-4 w-4" />
        Try again
      </button>
    </div>
  );
}
