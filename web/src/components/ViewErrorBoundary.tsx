import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  // Called when the user clicks restart; the app resets replay state here.
  onRestart?: () => void;
}
interface State {
  hasError: boolean;
}

// Catches render errors in a view so a single thrown error shows a short,
// recoverable message instead of unmounting the whole app (blank page). The
// error is logged to the console for debugging.
export default class ViewErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log for debugging; this is the signal the page used to swallow.
    console.error("View error boundary caught:", error, info.componentStack);
  }

  private handleRestart = () => {
    this.props.onRestart?.();
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="view-error" role="alert">
          <p>This section hit an error. Restart the replay.</p>
          <button className="btn-primary" onClick={this.handleRestart}>
            Restart
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
