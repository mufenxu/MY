import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initTheme } from '@my-platform/pearl-tokens/theme.js'
import 'antd/dist/reset.css'; // Import Ant Design styles
import './index.css'; // Ensure our custom styles are loaded
import { startUpdateChecker } from './utils/updateChecker'
import { installExperienceMonitoring } from './utils/runtime'

initTheme()
startUpdateChecker()
installExperienceMonitoring()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
