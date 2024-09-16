import React, { useState } from 'react';
import Button from '../Button/Button';
import { useWebSocket } from '../WebSocketManager/WebSocketManager';
import { Link } from 'react-router-dom';

const SimulationManagerButtons : React.FC = () => {
    const { ws, gama} = useWebSocket();
    const [showPopUp, setshowPopUp] = useState(false);

      // Faire le useEffect pour load automatiquement après que connecté  
      // gama.connected && useEffect(() => {
      //     if (isWsConnected && ws !== null) {
      //       ws.send(JSON.stringify({"type": "launch_experiment"}));
      //     }
      //   }, [gama.connected]);
    
      const togglePopUp = () => {
        setshowPopUp(!showPopUp);
      };


      const handlePlayPause = () => {
        if(ws !== null){
            ws.send(JSON.stringify({"type": gama.experiment_state == "NONE" ? "launch_experiment" : (gama.experiment_state != "RUNNING" ? "resume_experiment" : "pause_experiment") }));
          }else{
          console.error("WS is null");
        }
      };
    
      const handleEnd = () => {
        if(ws !== null){
            ws.send(JSON.stringify({"type": "stop_experiment"}));
          }else{
          console.error("WS is null");
        }
      };

      const handleTryConnection = () => {
        if(ws !== null){
            ws.send(JSON.stringify({"type": "try_connection"}));
          }else{
          console.error("WS is null");
        }
      };
      // console.log(gama.experiment_state);


      const icon = gama.experiment_state === 'LAUNCHING'  ? (
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
            d="M10 9v6m4-6v6" // Verticals bars for "pause"
          />
        </svg>

      ) : gama.experiment_state === 'NONE' || gama.experiment_state === 'NOTREADY' || gama.experiment_state === 'PAUSED' ? (
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
            d="M5 3l14 9-14 9V3z" // triangle for "play"
          />
        </svg>
      ) : (
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
            d="M10 9v6m4-6v6" 
          />
        </svg>
      );
    return (
      <div>
            {!gama.connected && (
              <div className="flex justify-center mb-4">
                  <Button onClick={handleTryConnection} text="Try Connection" bgColor="bg-gray-500" icon={
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
                  } showText={true} />
              </div>
            )}
            <div className="flex justify-center space-x-2">
            
                {/* add a new button */}
                <Button
                  onClick={handlePlayPause}
                  text={ 
                    gama.experiment_state === 'NONE' ? 'Launch' :
                    gama.experiment_state === 'RUNNING' ? 'Pause' :
                    gama.experiment_state === 'NOTREADY' ? 'Not Ready' : 'Resume'
                  }
                  bgColor={
                    gama.experiment_state === 'RUNNING'
                    ? 'bg-orange-500' 
                    : 'bg-green-500'
                  }                  
                icon={ icon
                }
                  showText={true}
                />

                <Button onClick={handleEnd} text="End" bgColor="bg-red-500" 
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
                  } showText={true} 
                />
                
            </div>
            
        <div className='flex justify-center mt-3'>
          <Button
            text="Monitoring"
            bgColor="bg-blue-500"
            showText={true}
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="35" height="35">
                <rect x="5" y="5" width="30" height="20" rx="2" ry="2" fill="#d1d1d1" stroke="#333" strokeWidth="1"/>
                <rect x="7" y="7" width="26" height="16" fill="#fff" stroke="#333" strokeWidth="1"/>
                <line x1="7" y1="15" x2="33" y2="15" stroke="#333" strokeWidth="1"/>
                <line x1="20" y1="7" x2="20" y2="23" stroke="#333" strokeWidth="1"/>
                <rect x="18" y="26" width="4" height="4" fill="#333"/>
                <rect x="16" y="30" width="8" height="2" fill="#333"/>
              </svg>
            }
            onClick={togglePopUp}
          />

          {showPopUp && (
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
              <div className="bg-white p-6 rounded-lg shadow-lg w-64 text-center">
                <h2 className="text-lg font-semibold mb-4">Choose an Option</h2>

                <div className="flex flex-col space-y-4">
                  <Button
                    text="Shared Screen"
                    bgColor="bg-green-500 hover:bg-green-600"
                    onClick={
                      togglePopUp
                      // add logic 
                    }
                  />
                  <Button
                    text="Full Screen"
                    bgColor="bg-blue-500 hover:bg-blue-600"
                    onClick={
                      togglePopUp
                    
                    }
                  />
                </div>

                <button
                  className="bg-red-500 mt-4 text-white hover:underline"
                  onClick={togglePopUp}
                >
                  Cancel
                </button>
              
              </div>
            </div>
          )}
       </div>

    </div>
          
    );
};

export default SimulationManagerButtons;