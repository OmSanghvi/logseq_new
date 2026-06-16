import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

/** Catches render/runtime errors so the window shows a message instead of going blank. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface in the devtools console too.
    console.error('Renderer error:', error, info)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 40,
            fontFamily: 'var(--font-ui)',
            color: 'var(--text-normal)',
            whiteSpace: 'pre-wrap'
          }}
        >
          <h2 style={{ color: '#ff6b6b' }}>Something went wrong</h2>
          <p style={{ color: 'var(--text-muted)' }}>{this.state.error.message}</p>
          <pre style={{ color: 'var(--text-faint)', fontSize: 12, overflow: 'auto' }}>
            {this.state.error.stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}
