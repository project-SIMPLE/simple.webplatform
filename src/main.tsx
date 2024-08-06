import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import MainPanel from './components/MainPanel/MainPanel';
import Navigation from './components/navigation/navigation';
import SelectorSimulations from './components/SelectorSimulations/SelectorSimulations';
import WebSocketManager from './components/WebSocketManager/WebSocketManager';


const App: React.FC = () => {
  return (
    <BrowserRouter>
        <WebSocketManager>
            <Routes>
                <Route path="/" element={<MainPanel />} />
                <Route path="navigation" element={<Navigation />} />
                <Route path="selectSimulations" element={<SelectorSimulations />} />
            </Routes>
        </WebSocketManager>
    </BrowserRouter>
  );
};

const container = document.getElementById('root')!;
const root = ReactDOM.createRoot(container);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

