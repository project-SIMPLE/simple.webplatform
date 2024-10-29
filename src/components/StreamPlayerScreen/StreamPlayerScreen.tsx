import React, { useEffect } from 'react';
import { useScreenModeState } from '../ScreenModeContext/ScreenModeContext';
import VideoStreamManager from "../WebSocketManager/VideoStreamManager";

const StreamPlayerScreen: React.FC = () => {
  const screenModeDisplay = useScreenModeState();

  useEffect(() => {
    console.log("Screen Mode Display updated:", screenModeDisplay);

    // Si vous souhaitez forcer un re-render périodique, décommentez ci-dessous.
    // const interval = setInterval(() => {
    //   setTrigger((prev) => !prev);
    // }, 4000);
    // return () => clearInterval(interval);
  }, [screenModeDisplay]);

  // Rendu basé sur la valeur de screenModeDisplay
  return (
    <>
      <VideoStreamManager />

      {screenModeDisplay === 'shared_screen' && (
        <div className="relative w-full h-screen bg-gray-100 flex">
          {/* Left Column (Top Left + Bottom Left Rectangles) */}
          <div className="w-[30%] h-full flex flex-col justify-between">
            {/* Top Left Rectangle */}
            <div className="w-full h-1/2 bg-gray-600 flex items-center justify-center border-t border-l border-b border-black"></div>
            {/* Bottom Left Rectangle */}
            <div className="w-full h-1/2 bg-gray-600 flex items-center justify-center border-l border-b border-black"></div>
          </div>

          {/* Center Rectangle */}
          <div className="w-[40%] h-full bg-gray-400 flex items-center justify-center border-t border-b border-black">
            {/* Center Content Here */}
          </div>

          {/* Right Column (Top Right + Bottom Right Rectangles) */}
          <div className="w-[30%] h-full flex flex-col justify-between">
            {/* Top Right Rectangle */}
            <div className="w-full h-1/2 bg-gray-600 flex items-center justify-center border-t border-r border-b border-black"></div>
            {/* Bottom Right Rectangle */}
            <div className="w-full h-1/2 bg-gray-600 flex items-center justify-center border-r border-b border-black"></div>
          </div>
        </div>
      )}

      {screenModeDisplay === 'gama_screen' && (
        <div className='bg-gray-400 relative w-full h-screen flex'>
          {/* Your content for gama_screen */}
        </div>
      )}

      {screenModeDisplay !== 'gama_screen' && screenModeDisplay !== 'shared_screen' && (
        <div className='bg-red-400 relative w-full h-screen flex items-center justify-center'>
          <p>Unknown screen mode: {screenModeDisplay}</p>
        </div>
      )}
    </>
  );
};

export default StreamPlayerScreen;
