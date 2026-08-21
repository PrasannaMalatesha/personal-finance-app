import { Component, type ErrorInfo, type ReactNode } from 'react';
import { PageError } from './PageError';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Catches render errors anywhere below the app root and shows the generic
 * error page instead of a blank white screen. Logs the failure to the
 * console so Sentry (or any future observability layer) picks it up.
 *
 * Reset behavior: unmounts + re-mounts children on retry — React doesn't
 * give a native "reset after error" path, and re-render usually is enough
 * because the source of the error is often stale state that a fresh mount
 * clears.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('AppErrorBoundary caught:', error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return <PageError variant="generic" onRetry={this.reset} />;
    }
    return this.props.children;
  }
}
