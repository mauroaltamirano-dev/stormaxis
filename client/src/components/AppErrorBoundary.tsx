import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportClientError } from '../lib/monitoring'

type Props = {
  children: ReactNode
}

type State = {
  hasError: boolean
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const componentStack = info.componentStack?.slice(0, 500) ?? 'no-component-stack'
    reportClientError(error, `react.error-boundary:${componentStack}`)
  }

  private handleReload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--nexus-bg)',
          color: 'var(--nexus-text)',
          padding: '1rem',
        }}
      >
        <div
          style={{
            maxWidth: '540px',
            width: '100%',
            border: '1px solid rgba(248,113,113,0.35)',
            background: 'rgba(127,29,29,0.16)',
            padding: '1.2rem',
            display: 'grid',
            gap: '0.9rem',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: '1rem',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#fecaca',
            }}
          >
            Error de interfaz
          </div>
          <div style={{ color: '#e2e8f0' }}>
            Algo falló en la UI. Ya registramos el error para diagnóstico.
          </div>
          <button
            onClick={this.handleReload}
            style={{
              border: '1px solid rgba(148,163,184,0.4)',
              background: 'rgba(2,6,23,0.72)',
              color: '#e2e8f0',
              padding: '0.75rem 1rem',
              cursor: 'pointer',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Recargar
          </button>
        </div>
      </div>
    )
  }
}
