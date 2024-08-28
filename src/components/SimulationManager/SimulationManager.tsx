import React, { useEffect } from 'react';
import Button from '../Button/Button';
import VRHeadset from '../VRHeadset/VRHeadset';
import { useWebSocket } from '../WebSocketManager/WebSocketManager';
import SimulationState from './SimulationState';
import SimulationManagerButtons from './SimulationManagerButtons';
import Navigation from '../Navigation/Navigation';
import { useNavigate } from 'react-router-dom';

const SimulationManager : React.FC = () => {
  const { ws, gama, playerList, selectedSimulation, isWsConnected } = useWebSocket();
  const navigate = useNavigate();

 
  useEffect(() => {
    if (isWsConnected && ws !== null) {
      // console.log('Selected simulation:', selectedSimulation);
    }
  }, [selectedSimulation]);


  // UseEffect to add players when playerList changes
  useEffect(() => {
    if (isWsConnected && ws !== null) {
      Object.keys(playerList).forEach((key, index) => {
        ws.send(JSON.stringify({ type: "add_player_headset", id: key }));
      });
    }
  }, [playerList, isWsConnected, ws]);

   // Redirect to main page if no simulation is selected
   useEffect(() => {
    if (!selectedSimulation) {
      navigate('/'); 
    }
  }, [selectedSimulation, navigate]);

  //  Handler for players 
  const handleRemove = (index: number) => {
    if(ws !== null){
        ws.send(JSON.stringify({"type": "remove_player_headset", "id": index}));
      }else{
      console.error("WS is null");
    }
  };

  const handleRestart = (index: number) => {
    console.log(`Restart button clicked for headset ${index}`);
    // Logic for restart button ...
  };

  console.log(selectedSimulation);
  
  return (
    
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <Navigation />
      <div className="w-2/3 bg-white p-8 shadow-lg rounded-lg text-center">
      {/* case Simulation Selected */}
      {selectedSimulation ? (
      <div> 
        <div className="text-3xl mb-4">{selectedSimulation.name}</div> 
        <div className="flex justify-center mb-4">
            
            <div
              style={{ marginTop: '7.5px', marginRight: '15.2px' }}
              className={`w-3 h-3 rounded-full  ${
                gama.connected ? 'bg-green-500' : 'bg-gray-500'
              }`}
            ></div>
            
            <span className={gama.connected ? 'text-green-500' : 'text-gray-500'}>
              {gama.connected ? 'Connected' : 'Waiting for connection'}
            </span>
          </div>

          {/* Display the state of the simulation */}
          <SimulationState experiment_state={gama.experiment_state} />
        
          {/* Display Buttons to monitor the simulation */}
          <SimulationManagerButtons />

          {/* Display List of Players */}
          <div className="flex justify-center mt-8 space-x-4">
            
            {Object.keys(playerList).map((key, index) => {
              const player = playerList[key];
              return (
                <div key={index} className="flex flex-col items-center">
                  <VRHeadset isConnected={player.connected} />
                  <p style={{marginTop:"3px"}}>id player: {key}</p>
                  <p>{player.connected ? 'Connected' : 'Waiting for connection..'}</p>
                  
                  {/* Buttons under each players */}
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

      ) : (
          // case No Simulation Selected, (not displayed anymore) 
          <div className="text-3xl mb-4">No simulation selected</div> 
      )}
      </div>
    </div>
  );
};

export default SimulationManager;
