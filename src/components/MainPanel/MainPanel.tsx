// src/components/MainPanel.tsx
import React, { useState } from 'react';
import Button from '../Button/Button';
import VRHeadset from '../VRHeadset/VRHeadset';
import axios from 'axios';

const MainPanel: React.FC = () => {
  const [status, setStatus] = useState<boolean[]>([false, false, false, false]);

  const handleLaunch = () => {
    console.log('Launch button clicked');
    axios.post('http://localhost:3001/launch-experiment')
      .then(response => {
        console.log(response.data);
      })
      .catch(error => {
        console.error('There was an error launching the experiment!', error);
      });
  };

  const handleRemove = (index: number) => {
    console.log(`Remove button clicked for headset ${index}`);
    // Logic for remove button
  };

  const handleRestart = (index: number) => {
    console.log(`Restart button clicked for headset ${index}`);
    // Logic for restart button
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="w-2/3 bg-white p-8 shadow-lg rounded-lg text-center">
        <div className="text-3xl mb-4">Waiting..</div>
        <div className="flex justify-center">
          <Button onClick={handleLaunch} text="Launch" bgColor="bg-red-500" icon={
            <svg
              className="w-6 h-6 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M14.752 11.168l-6.5-3.75A1 1 0 007 8.25v7.5a1 1 0 001.252.832l6.5-3.75a1 1 0 000-1.664z"
              />
            </svg>
          } />
        </div>
      </div>
      <div className="flex justify-center mt-8 space-x-4">
        {status.map((isConnected, index) => (
          <div key={index} className="flex flex-col items-center">
            <VRHeadset isConnected={isConnected} />
            <div className="flex mt-4 space-x-2">
              <Button
                onClick={() => handleRemove(index)}
                text="Remove"
                bgColor="bg-red-500"
                icon={
                  <svg
                    className="w-6 h-6 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                }
              />
              <Button
                onClick={() => handleRestart(index)}
                text="Restart"
                bgColor="bg-orange-500"
                icon={
                  <svg
                    className="w-6 h-6 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 4v6h6M20 20v-6h-6M4 10c1.5-2 4-3 6-3h4c2 0 4 1 5 3M4 14c1.5 2 4 3 6 3h4c2 0 4-1 5-3"
                    />
                  </svg>
                }
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MainPanel;
