import React from 'react';

type State = {
  hasError: boolean;
  errorMessage: string;
};

type Props = {
  children: React.ReactNode;
};

export default class AppErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message || 'Error desconocido',
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error capturado por AppErrorBoundary:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-lina-soft px-4">
          <div className="w-full max-w-xl rounded-2xl border border-lina-border bg-white p-6 shadow-soft text-center">
            <h1 className="text-xl font-bold text-lina-dark">Ocurrió un error en la pantalla</h1>
            <p className="mt-2 text-sm text-lina-gray">
              Recarga la página. Si persiste, compárteme este mensaje para corregirlo.
            </p>
            {this.state.errorMessage && (
              <p className="mt-3 text-xs break-words text-red-600">{this.state.errorMessage}</p>
            )}
            <button
              type="button"
              onClick={this.handleReload}
              className="mt-5 inline-flex items-center justify-center rounded-lg bg-lina-primary px-4 py-2 text-sm font-semibold text-white hover:bg-lina-primary-dark transition-colors"
            >
              Recargar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}