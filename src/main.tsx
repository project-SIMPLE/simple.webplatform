import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';

import { ScreenModeProvider } from './components/ScreenModeContext/ScreenModeContext';

import SimulationManager from './components/SimulationManager/SimulationManager';
import Navigation from './components/Navigation/Navigation';
import SelectorSimulations from './components/SelectorSimulations/SelectorSimulations';
import WebSocketManager from './components/WebSocketManager/WebSocketManager';
import StreamPlayerScreen from './components/StreamPlayerScreen/StreamPlayerScreen';

import TestMonitoringScreen from './components/TestMonitoringScreen/TestMonitoringScreen';

const App: React.FC = () => {
  return (
    <BrowserRouter>
            <WebSocketManager>
                <ScreenModeProvider>
                <Routes>
                    <Route index element={<SelectorSimulations />} />
                    <Route path="navigation" element={<Navigation />} />
                    <Route path="simulationManager" element={<SimulationManager />} />
                    <Route path="streamPlayerScreen" element={ <StreamPlayerScreen /> } />
                    <Route path="TestMonitoringScreen" element={ <TestMonitoringScreen /> } />
                </Routes>
              </ScreenModeProvider>
            </WebSocketManager>
    </BrowserRouter>
  );
};

const container = document.getElementById('root')!;
const root = ReactDOM.createRoot(container);

root.render(
  // <Provider store={store}>  
//  <React.StrictMode>
      <App />
//  </React.StrictMode>
    // </Provider>
);

