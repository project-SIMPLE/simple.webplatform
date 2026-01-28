import ReactDOM from 'react-dom/client';
import React from 'react';
import './i18next/i18n';
import './index.css';
import { getConsoleSink, configure } from '@logtape/logtape';
import { getPrettyFormatter } from "@logtape/pretty";

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ScreenModeProvider } from './components/ScreenModeContext/ScreenModeContext';
import SimulationManager from './components/SimulationManager/SimulationManager';
import Navigation from './components/Navigation/Navigation';
import SelectorSimulations from './components/SelectorSimulations/SelectorSimulations';
import WebSocketManager from './components/WebSocketManager/WebSocketManager';
import StreamPlayerScreenControl from './components/StreamPlayerScreen/StreamPlayerScreenControl';
import StreamPlayerScreen from './components/StreamPlayerScreen/StreamPlayerScreen';
import StreamFullscreen from './components/StreamPlayerScreen/StreamFullscreen';
import Test from './components/TestPage/Test';

await configure({
  sinks: {
    console: getConsoleSink({

    })
  },
  loggers: [
    {
      category: [], // The empty array acts as a wildcard for all categories
      sinks: ["console"],
      lowestLevel: "debug" // Capture everything from debug and above
    },
    { category: ["logtape", "meta"], sinks: ["console"], lowestLevel: "warning" },
  ]
});

const App = () => {


  return (
    <BrowserRouter>
      <WebSocketManager>
        <ScreenModeProvider>
          <Routes>
            <Route index element={<SelectorSimulations />} />
            <Route path="navigation" element={<Navigation />} />
            <Route path="simulationManager" element={<SimulationManager />} />
            <Route path="streamPlayerScreen" element={<StreamPlayerScreen />} />
            <Route path="streamPlayerScreenControl" element={<StreamPlayerScreenControl />} />
            <Route path="streamFullscreen" element={<StreamFullscreen />}></Route>
            <Route path="test" element={<Test />}></Route>
          </Routes>
        </ScreenModeProvider>
      </WebSocketManager>
    </BrowserRouter>
  );
};

const container = document.getElementById('root')!;
const root = ReactDOM.createRoot(container);

root.render(
  <App />
);

