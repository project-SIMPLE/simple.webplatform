import { Link, useNavigate } from 'react-router-dom';
import { useWebSocket } from '../WebSocketManager/WebSocketManager';
import React, { useEffect, useState } from 'react';
import Button from '../Button/Button';
import Navigation from '../Navigation/Navigation';
import VRHeadset from '../VRHeadset/VRHeadset';

const SelectorSimulations = () => {
  const { ws, isWsConnected, simulationList, selectedSimulation, playerList } = useWebSocket();
  const [directoryPath, setDirectoryPath] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [showCustomInput, setShowCustomInput] = useState<boolean>(false); 
  const navigate = useNavigate(); 

  useEffect(() => {
    if (isWsConnected && ws !== null) {
      ws.send(JSON.stringify({ type: 'get_simulation_informations' }));
      setLoading(true);
    }
  }, [isWsConnected, ws]);

  useEffect(() => {
    if (simulationList.length > 0) {
      setLoading(false);
    }
  }, [simulationList]);

  const handleSimulation = (index: number) => {
    if (isWsConnected && ws !== null) {
      ws.send(JSON.stringify({ type: 'get_simulation_by_index', simulationIndex: index }));
      setTimeout(() => {
        navigate('/simulationManager');
      }, 100); 
    } else {
      console.error('WebSocket is not connected');
    }
  };

  const handleRemove = (index: number) => {
    if (ws !== null) {
      ws.send(JSON.stringify({"type": "remove_player_headset", "id": index}));
    } else {
      console.error("WS is null");
    }
  };

  const handleRestart = (index: number) => {
    console.log(`Restart button clicked for headset ${index}`);
    // Logic for restart button ...
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white p-8">
      <Navigation />

      {loading ? (
        <div className="text-center">
          <div className="loader ease-linear rounded-full border-8 border-t-8 border-gray-200 h-24 w-24 mb-4"></div>
          <h2 className="text-gray-700">Loading simulations...</h2>
        </div>
      ) : (
       
        // Display simulations cards
       <div className="grid grid-cols-3 mt-5 mb-8" style={{ gap: '65px' }} >
          {simulationList.map((simulation, index) => (
            <div 
              className="bg-white shadow-lg rounded-3xl p-6 flex flex-col items-center h-40 cursor-pointer"
              style={{
                backgroundImage: `url(${simulation.splashscreen})`,
                backgroundSize: 'cover',
                width: "100px",
                height: "100px",
              }}
              key={index}
              onClick={() => handleSimulation(index)}
            >
                <h2 className="text-gray-500 text-sm text-center"
                 style={{
                marginTop: "80px",
                }}
                >{simulation.name}
                </h2>
            </div>
          ))}
        </div>
      )}

      
      {/* Show hidden sections*/}
      {showCustomInput && (
        
        // Section: path to start a simulation
        <div className="mt-4 w-full" style={{ marginTop: '20px', marginBottom: '-25px' }} >
          
          <h1 className="text-lg font-bold mb-4">Enter a simulation path:</h1>
          <input
            type="text"
            value={directoryPath}
            onChange={(e) => setDirectoryPath(e.target.value)}
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700"
            placeholder="C:/path/to/your/project"
          />
          <Button
            onClick={() => {
              if (isWsConnected && ws !== null) {
                ws.send(JSON.stringify({ type: 'get_simulation_informations' }));
              } else {
                console.error('WebSocket is not connected');
              }
            }}
            text="Launch"
            bgColor="bg-green-500"
            showText={true}
          />


        {/* // Section: Get simulation informations */}
        <div className="mt-7">
         <h1 className="text-lg font-bold mb-5">Get simulation informations:</h1>
         <Button
            onClick={() => {
              if (isWsConnected && ws !== null) {
                ws.send(JSON.stringify({ type: 'get_simulation_informations' }));
              } else {
                console.error('WebSocket is not connected');
              }
            }}
            text="Get Simulations Informations"
            bgColor="bg-green-500"
            showText={true}
          />
        </div>
        

        { /* 
           *Section display headsets 
           */
        }
        {playerList && Object.keys(playerList).length > 0 && (
          <>
            <h1 className="text-2xl font-bold mb-4">HeadSet connected:</h1>
            <div className="flex justify-center mt-8 space-x-4">
              {Object.keys(playerList).map((key, index) => {
                const player = playerList[key];
                return (
                  <div key={index} className="flex flex-col items-center">
                    <VRHeadset isConnected={player.connected} />
                    <p style={{ marginTop: "3px" }}>id player: {key}</p>
                    <p>{player.connected ? 'Connected' : 'Waiting for connection..'}</p>

                    {/* Buttons under each player */}
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
                            viewBox="0 24 24"
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
          </>
        )}


      </div>
        
      )}

      {/* Footer of the page */}
      <footer className="flex justify-between items-center p-4 border-t border-gray-300  w-full" style={{ marginTop: '100px' }} >
        <img src="/images/global-gateway-euro.png" alt="Global Gateway" className="h-8 mr-4" />

        {/* Info Button */}
        <Button
          onClick={() => setShowCustomInput(!showCustomInput)}
          text="Info"
          icon={
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-6 h-6 mr-2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"
              />
            </svg>
          }
          bgColor="bg-blue-500"
          showText={true}
        />

        <img src="images/IRD-logo.png" alt="IRD" className="h-8" />
      </footer>

    </div>
  );
};

export default SelectorSimulations;
