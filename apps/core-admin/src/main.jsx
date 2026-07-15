import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import 'antd/dist/reset.css'; // Import Ant Design styles
import './index.css'; // Ensure our custom styles are loaded
import { startUpdateChecker } from './utils/updateChecker'

startUpdateChecker()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
