import React, { useEffect } from 'react';
import Button from '../Button/Button';
import VRHeadset from '../VRHeadset/VRHeadset';
import { useWebSocket } from '../WebSocketManager/WebSocketManager';

const MainPanel: React.FC = () => {
  const { ws, gama, playerList, selectedSimulation, isWsConnected } = useWebSocket();

  // test the value of selectedSimulation if change it after each click 
  useEffect(() => {
    if (isWsConnected && ws !== null) {
      console.log('Selected simulation:', selectedSimulation);
    }

  }, [selectedSimulation]);

  
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

  const handleRemove = (index: number) => {
    if(ws !== null){
        ws.send(JSON.stringify({"type": "remove_player_headset", "id": index}));
      }else{
      console.error("WS is null");
    }
  };

  const handleRestart = (index: number) => {
    console.log(`Restart button clicked for headset ${index}`);
    // Logic for restart button
  };

  const handleTryConnection = () => {
    if(ws !== null){
        ws.send(JSON.stringify({"type": "try_connection"}));
      }else{
      console.error("WS is null");
    }
  };

  const renderExperimentState = () => {
    switch (gama.experiment_state) {
      case 'RUNNING':
        return (
          <div className="flex justify-center mb-4">
            <svg
              className="w-6 h-6 mr-2 text-green-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span className="text-green-500">Simulation is running</span>
          </div>
        );
      case 'PAUSED':
        return (
          <div className="flex justify-center mb-4">
            <svg
              className="w-6 h-6 mr-2 text-orange-400"
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
            <span className="text-orange-400">Simulation is paused</span>
          </div>
        );
      case 'NONE':
      default:
        return (
          <div className="flex justify-center mb-4">
            <svg
              className="w-6 h-6 mr-2 text-red-500"
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
            <span className="text-red-500">Simulation not launched</span>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="w-2/3 bg-white p-8 shadow-lg rounded-lg text-center">
      {selectedSimulation ? (
      <div className="text-3xl mb-4">Waiting {selectedSimulation.name} .. </div> 
      ) : (
          <div className="text-3xl mb-4">No simulation selected</div> 
      )}
      <div className="flex justify-center mb-4">
          <svg
            className={`w-6 h-6 mr-2 ${gama.connected ? 'text-green-500' : 'text-gray-500'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M5 13l4 4L19 7"
            />
          </svg>
          <span className={gama.connected ? 'text-green-500' : 'text-gray-500'}>
            {gama.connected ? 'Connected' : 'Waiting for connection'}
          </span>
        </div>
        
        {/* display experiment state: */}
        {renderExperimentState()}
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
          <Button onClick={handlePlayPause} text="Play/Pause" bgColor="bg-green-500" icon={
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
          } showText={true} />
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
      <div className="flex justify-center mt-8 space-x-4">
        
        {Object.keys(playerList).map((key, index) => {
          const player = playerList[key];
          return (
            <div key={index} className="flex flex-col items-center">
              <VRHeadset isConnected={player.connected} />
              <p>{player.connected ? 'Connected' : 'Waiting for connection..'}</p>
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
                  showText={false}
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
                  showText={false}
                />
              </div>
            </div>
          );
        })}
      </div>
          </div>
  );
};

export default MainPanel;
