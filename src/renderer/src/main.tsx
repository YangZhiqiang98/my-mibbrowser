import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ToolWindowApp } from './ToolWindowApp'
import './styles.css'

const isToolWindow = new URLSearchParams(window.location.search).has('tool')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isToolWindow ? <ToolWindowApp /> : <App />}
  </React.StrictMode>
)
