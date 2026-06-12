import ReactDOM from 'react-dom/client'
import App from './App'
import { initializeTheme } from '@/lib/themeSettings'

initializeTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />,
)
