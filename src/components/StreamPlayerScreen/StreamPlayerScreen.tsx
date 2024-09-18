import React, { useEffect } from 'react';
import { useWebSocket } from '../WebSocketManager/WebSocketManager';
import { useSelector } from 'react-redux';
import { RootState } from '../../redux/store';

const StreamPlayerScreen: React.FC = () => {
  // const {screenMode} = useWebSocket();

  const screenMode = useSelector((state: RootState) => state.screenMode.screenMode); // Accéder à l'état global
 

  // const [mode, setMode] = useState<string>("");
  // here take the value variable from the websocketManager 
  
   useEffect(() => {
      console.log("Screen Mode updated :", screenMode);
   }, [screenMode]);

  // console.log(screenMode);

  return (
    <>
      {screenMode === 'shared_screen' && (
        <div className="relative w-full h-screen bg-gray-100 flex">

          {/* Left Column (Top Left + Bottom Left Rectangles) */}
          <div className="w-[30%] h-full flex flex-col justify-between">
            {/* Top Left Rectangle */}
            <div className="w-full h-1/2 bg-gray-600 flex items-center justify-center border-t border-l border-b border-black">
            
            </div>

            {/* Bottom Left Rectangle */}
            <div className="w-full h-1/2 bg-gray-600 flex items-center justify-center border-l border-b border-black">
            
            </div>
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

      {screenMode === 'gama_screen' && (
        <div className='bg-gray-400 relative w-full h-screen flex'>
          
        </div>
      )}
    </>
  );
};

export default StreamPlayerScreen;
