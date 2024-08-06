  // src/components/App.tsx
  import React, { useState } from 'react';
  // import VRHeadset from './components/VRHeadset/VRHeadset';
  // import Button from './components/Button/Button';
  import MainPanel from './components/MainPanel/MainPanel';
  import { BrowserRouter as Router, Route, Routes, Link } from 'react-router-dom';


  const App: React.FC = () => {

    return (

      <MainPanel />
      
    );
  };

  export default App;
