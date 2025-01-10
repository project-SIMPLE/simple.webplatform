import { useEffect, useState } from 'react';

import Button from '../Button/Button';

import { useScreenMode } from '../ScreenModeContext/ScreenModeContext';


const TestMonitoringScreen = () => {
  const [, setTrigger] = useState(false); 
 
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
        {/* Les deux boutons, quand cliqués changent la vue dans StreamPlayerScreen */}
        {/* Monitoring Button */}
        <div className='flex justify-center mt-3'>
              
                  <div className="bg-white p-6 rounded-lg shadow-lg w-64 text-center">
                    <h2 className="text-lg font-semibold mb-4">Choose an Option</h2>

                    
                    <div className="flex flex-col space-y-4">
                      
                      <Button
                        text="Gama Screen"
                        bgColor="bg-green-500 hover:bg-green-600"
                        onClick={() => {
                          togglePopUp("gama_screen");
                        }}
                      />

                      <Button
                        text="Shared Screen"
                        bgColor="bg-blue-500 hover:bg-blue-600 "
                        onClick={() => {
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
        </div>
            {/* End Monitoring button */}
    </>
  );
};

export default TestMonitoringScreen;
