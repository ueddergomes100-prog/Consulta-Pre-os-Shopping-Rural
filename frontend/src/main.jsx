import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import CatalogApp from './CatalogApp.jsx'

const isCatalog = window.location.pathname.startsWith('/catalogo')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isCatalog ? <CatalogApp /> : <App />}
  </StrictMode>,
)
