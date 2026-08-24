import React from 'react'
import ReactDOM from 'react-dom/client'

import { App } from './app/App'
import { PrototypeProvider } from './app/PrototypeContext'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PrototypeProvider>
      <App />
    </PrototypeProvider>
  </React.StrictMode>,
)
