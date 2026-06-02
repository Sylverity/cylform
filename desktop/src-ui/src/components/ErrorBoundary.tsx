import React, { type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Cylform crashed:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            padding: '2rem',
            textAlign: 'center',
            fontFamily: 'system-ui, sans-serif',
            background: '#0f172a',
            color: '#e2e8f0',
          }}
        >
          <h1 style={{ marginBottom: '1rem', color: '#f87171' }}>
            Something went wrong
          </h1>
          <p style={{ maxWidth: '480px', lineHeight: 1.6, marginBottom: '2rem' }}>
            Cylform encountered an unexpected error. Try reloading the app or
            opening a different file.
          </p>
          {this.state.error && (
            <pre
              style={{
                background: '#1e293b',
                padding: '1rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
                maxWidth: '640px',
                overflow: 'auto',
                textAlign: 'left',
              }}
            >
              {this.state.error.toString()}
            </pre>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '2rem',
              padding: '0.6rem 1.5rem',
              fontSize: '1rem',
              borderRadius: '6px',
              border: 'none',
              background: '#10b981',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Reload Cylform
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
