import React from 'react';
import ReactDOM from 'react-dom/client';
import { AdminDashboard } from './AdminDashboard.jsx';
import './styles.css';
import './admin.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AdminDashboard />
  </React.StrictMode>,
);
