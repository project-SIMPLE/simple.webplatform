import React, {FC, useEffect } from 'react';
import Button from '../Button/Button';
import { useWebSocket } from '../WebSocketManager/WebSocketManager';


const SimulationManagerButtons : React.FC = () => {
    const { ws, gama, playerList, selectedSimulation, isWsConnected } = useWebSocket();

    const handleLaunch = () => {
        if(ws !== null){
            ws.send(JSON.stringify({"type": "resume_experiment"}));
          }else{
          console.error("WS is null");
        }
      };
    
      const handleLoad = () => {
        if(ws !== null){
            ws.send(JSON.stringify({"type": "launch_experiment"}));
          }else{
          console.error("WS is null");
        }
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
      
    return (
        <div>
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

            <div className="flex justify-center space-x-2">
                <Button onClick={handleLoad} text="Load" bgColor="bg-blue-500" icon={
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
                    d="M12 4v16m8-8H4"
                    />
                </svg>
                } showText={true} />
                
                <Button
                  onClick={handlePlayPause}
                  text={gama.experiment_state === 'RUNNING' ? 'Pause' : 'Resume'}
                  bgColor="bg-green-500"
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
                        d="M10 9v6m4-6v6" 
                      />
                    </svg>
                  }
                  showText={true}
                />

                <Button onClick={handleEnd} text="End" bgColor="bg-red-500" icon={
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
                } showText={true} />
            </div>
          </div>
          
    );
};

export default SimulationManagerButtons;