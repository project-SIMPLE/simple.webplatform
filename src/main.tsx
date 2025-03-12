import ReactDOM from 'react-dom/client';
import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import { ScreenModeProvider } from './components/ScreenModeContext/ScreenModeContext';
import SimulationManager from './components/SimulationManager/SimulationManager';
import Navigation from './components/Navigation/Navigation';
import SelectorSimulations from './components/SelectorSimulations/SelectorSimulations';
import WebSocketManager from './components/WebSocketManager/WebSocketManager';
import './i18next/i18n';
import StreamPlayerScreenControl from './components/StreamPlayerScreen/StreamPlayerScreenControl';


const App = () => {
  return (
    <BrowserRouter>
            <WebSocketManager>
                <ScreenModeProvider>
                <Routes>
                    <Route index element={<SelectorSimulations />} />
                    <Route path="navigation" element={<Navigation />} />
                    <Route path="simulationManager" element={<SimulationManager />} />
                    <Route path="streamPlayerScreen" element={ <StreamPlayerScreenControl /> } />
                </Routes>
              </ScreenModeProvider>
            </WebSocketManager>
    </BrowserRouter>
  );
};

const container = document.getElementById('root')!;
const root = ReactDOM.createRoot(container);

root.render(
   // <React.StrictMode>
      <App />
   // </React.StrictMode> 
);

