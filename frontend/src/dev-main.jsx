import React from 'react';
import ReactDOM from 'react-dom/client';
import { DeveloperConsole } from './DeveloperConsole.jsx';
import './styles.css';
import './devconsole.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <DeveloperConsole />
  </React.StrictMode>,
);
