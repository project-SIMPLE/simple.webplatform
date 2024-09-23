import React, { useEffect, useState } from 'react';

// import { useWebSocket } from '../WebSocketManager/WebSocketManager';
import Button from '../Button/Button';

import { useScreenMode } from '../ScreenModeContext/ScreenModeContext';

// import { useSelector } from 'react-redux';
// import { RootState } from '../../redux/store';

const TestMonitoringScreen: React.FC = () => {
  // const {screenMode} = useWebSocket();
  const [, setTrigger] = useState(false); 
  // const screenMode = useSelector((state: RootState) => state.screenMode.screenMode); // Accéder à l'état global
 
//   const { screenModeDisplay } = useScreenMode();
  const [showPopUp, setshowPopUp] = useState(false);
  const {setScreenModeDisplay, screenModeDisplay } = useScreenMode();


  useEffect(() => {
    console.log("Screen Mode Display updated :", screenModeDisplay);
  }, [screenModeDisplay]);

  const popPup = () => {  
    setshowPopUp(!showPopUp);
  };

  const togglePopUp = (mode: string) => {
    setScreenModeDisplay(mode); // update screenModeDisplay from the context 
    console.log("in paramaeter: "+ mode+ " screenModeDisplay: "+ screenModeDisplay);
    setshowPopUp(!showPopUp);
  };

  return (
    <>
        {/* Les deux bouttons, quand clique change la vue dans StreamPlayerScreen */}
        {/* Monitoring Button */}
        <div className='flex justify-center mt-3'>
              
                {/* <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50"> */}
                  <div className="bg-white p-6 rounded-lg shadow-lg w-64 text-center">
                    <h2 className="text-lg font-semibold mb-4">Choose an Option</h2>

                    
                    <div className="flex flex-col space-y-4">
                      
                      <Button
                        text="Gama Screen"
                        bgColor="bg-green-500 hover:bg-green-600"
                        onClick={() => {
                          // setModeScreen("full_screen");
                          // console.log(modeScreen);
                          togglePopUp("gama_screen");
                        }}
                      />

                      <Button
                        text="Shared Screen"
                        bgColor="bg-blue-500 hover:bg-blue-600 "
                        onClick={() => {
                            // setModeScreen("shared_screen");
                            // console.log(modeScreen);
                            togglePopUp("shared_screen");
                        }}
                      />
                      
                    </div>

                    <button
                      className="bg-red-500 mt-4 text-white hover:underline"
                      onClick={() => {popPup()}}
                    >
                      Cancel
                    </button>
                  
                  </div>
                {/* </div> */}
        </div>
            {/* End Monotoring button */}
    </>
  );
};

export default TestMonitoringScreen;
