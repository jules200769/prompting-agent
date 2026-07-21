import { Component, type ReactNode } from "react";

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error("[Anvyll] render error:", error, info);
  }

  reset = () => this.setState({ hasError: false, error: undefined });

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full p-6 bg-bg-950 text-slate-100 overflow-auto">
          <div className="max-w-xl mx-auto">
            <h2 className="text-lg font-semibold text-bad mb-2">Something crashed</h2>
            <p className="text-muted text-xs mb-4">
              The renderer hit an uncaught error. Details below — copy them back so it can be fixed.
            </p>
            <pre className="text-xs font-mono bg-bg-900 border border-line rounded-md p-3 whitespace-pre-wrap break-words text-bad/90">
              {this.state.error?.stack ?? String(this.state.error)}
            </pre>
            <button
              onClick={this.reset}
              className="mt-4 px-3 py-1.5 text-xs rounded-md bg-accent text-white"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
