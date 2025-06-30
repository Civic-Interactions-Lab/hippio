import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { WebSocketProvider } from './contexts/WebSocketContext.tsx';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <WebSocketProvider>
            <App />
        </WebSocketProvider>
    </React.StrictMode>
)
