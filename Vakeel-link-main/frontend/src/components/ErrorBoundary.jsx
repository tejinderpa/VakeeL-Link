import { Component } from 'react';
import ErrorPage from '../pages/ErrorPage';

/**
 * Catches React render errors so the whole Vercel SPA does not go blank.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('ErrorBoundary caught:', error, info);
    }
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      const msg = this.state.error?.message || String(this.state.error);
      return (
        <ErrorPage
          title="This page crashed"
          description="Something in the UI failed. Retry or go home — other pages may still work."
          detail={msg}
          onRetry={this.handleRetry}
        />
      );
    }
    return this.props.children;
  }
}
