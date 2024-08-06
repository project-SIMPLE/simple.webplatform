// src/components/MainPanel.tsx
import React, { useState } from 'react';
import Button from '../Button/Button';
import VRHeadset from '../VRHeadset/VRHeadset';
import axios from 'axios';

const MainPanel: React.FC = () => {
  const [status, setStatus] = useState<boolean[]>([false, false, false, false]);

  const handleLaunch = () => {
    // Logic for launch button
    console.log('Launch button clicked');
    axios.post('http://localhost:3001/launch-experiment')
    .then(response => {
      console.log(response.data);
    })
    .catch(error => {
      console.error('There was an error launching the experiment!', error);
    });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="w-2/3 bg-white p-8 shadow-lg rounded-lg text-center">
        <div className="text-3xl mb-4">Waiting..</div>
        <div className="flex justify-center">
          <Button onClick={handleLaunch} />
        </div>
      </div>
      <div className="flex justify-center mt-8 space-x-4">
        {status.map((isConnected, index) => (
          <VRHeadset key={index} isConnected={isConnected} />
        ))}
      </div>
    </div>
  );
};

export default MainPanel;
