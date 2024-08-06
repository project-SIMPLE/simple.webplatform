import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import MainPanel from './components/MainPanel/MainPanel';
import Navigation from './components/navigation/navigation';
import SelectorSimulations from './components/SelectorSimulations/SelectorSimulations';
const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainPanel />} />
        <Route path="navigation" element={<Navigation />} />
        <Route path="selectSimulations" element={<SelectorSimulations />} />
        
      </Routes>
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

