import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'
import './styles/theme.css'
import './styles/app.css'
import './styles/markdown.css'
import './styles/components.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
