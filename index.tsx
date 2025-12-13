import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

// Simple Error Boundary implementation for initialization crashes
try {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (e) {
  console.error("CRITICAL RENDER ERROR:", e);
  rootElement.innerHTML = `
    <div style="padding: 20px; color: #ff4444; font-family: monospace; background: #111; height: 100vh;">
      <h1>Application Crashed</h1>
      <p>Please check the console for more details.</p>
      <pre>${e instanceof Error ? e.message : JSON.stringify(e)}</pre>
    </div>
  `;
}