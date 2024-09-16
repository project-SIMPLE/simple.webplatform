import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import SimulationManager from './components/SimulationManager/SimulationManager';
import Navigation from './components/Navigation/Navigation';
import SelectorSimulations from './components/SelectorSimulations/SelectorSimulations';
import WebSocketManager from './components/WebSocketManager/WebSocketManager';
import StreamPlayerScreen from './components/StreamPlayerScreen/StreamPlayerScreen';


const App: React.FC = () => {
  return (
    <BrowserRouter>
        <WebSocketManager>
            <Routes>
                <Route index element={<SelectorSimulations />} />
                <Route path="navigation" element={<Navigation />} />
                <Route path="simulationManager" element={<SimulationManager />} />
                <Route path="streamPlayerScreen" element={ <StreamPlayerScreen /> } />
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

