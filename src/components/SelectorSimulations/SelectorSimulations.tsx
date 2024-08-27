import { Link } from 'react-router-dom';
import { useWebSocket } from '../WebSocketManager/WebSocketManager';
import React, { useEffect, useState } from 'react';
import Button from '../Button/Button';
import Navigation from '../Navigation/Navigation';
import VRHeadset from '../VRHeadset/VRHeadset';

const SelectorSimulations = () => {
  const { ws, isWsConnected, simulationList, selectedSimulation, playerList } = useWebSocket();
  const [directoryPath, setDirectoryPath] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

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
    } else {
      console.error('WebSocket is not connected');
    }
  };

  // for headsets : 
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

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-8">
      <Navigation />
      <h1 className="text-3xl font-bold mb-4">Select a simulation </h1>

      {loading ? (
        <div className="text-center">
          {/* Spinner loading */}
          <div className="loader ease-linear rounded-full border-8 border-t-8 border-gray-200 h-24 w-24 mb-4"></div>
          <h2 className="text-gray-700">Loading simulations...</h2>
        </div>
      ) : (
        <div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {simulationList.map((simulation, index) => (
            <Link to="/simulationManager" className="text-black" key={index}>
              
              <div onClick={() => {handleSimulation(index);}} key={index} className="bg-white shadow-lg rounded-lg p-6 flex flex-col items-center h-64"
                style={{
                  backgroundImage: `url(${simulation.splashscreen})`,
                  backgroundSize: 'cover', 
                  width:"429px",
                  height:"250px",
                  // backgroundPosition: 'center' 
                }}
                
>               
                <h2 className="text-2xl font-semibold mb-4">{simulation.name}</h2>
                {/*<p className="text-gray-500">experiment name: {simulation.experiment_name}</p>
                <p className="text-gray-500">File path simulation: </p>
                <p className="text-gray-500">{simulation.model_file_path}</p>
                <p className="text-gray-500">{simulation.splashscreen}</p> */}
              </div>
            </Link>
          ))}
        </div>
          
         
      
      <h1 className="text-2xl font-bold mb-4">HeadSet connected : </h1>
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

      <div className="mt-8">
        <h1 className="text-2xl font-bold mb-4">Enter Project Directory Path: </h1>


        <input
          id="directoryPath"
          type="text"
          value={directoryPath}
          onChange={(e) => setDirectoryPath(e.target.value)}
          className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          placeholder="C:/path/to/your/project"
        />
      </div>
      <Button
        onClick={() => {
          if (isWsConnected && ws !== null) {
            ws.send(JSON.stringify({ type: 'get_simulation_informations' }));
          } else {
            console.error('WebSocket is not connected');
          }
        }}
        text="Launch Selected Simulation"
        bgColor="bg-green-500"
        icon={
          <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 9v6m4-6v6" />
          </svg>
        }
        showText={true}
      />
      </div>
      )}

      <div className="flex flex-col items-center justify-center mt-8">
        
        <h1 className="text-2xl font-bold mb-4">Get simulation informations: </h1>
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
          icon={
            <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 9v6m4-6v6" />
            </svg>
          }
          showText={true}
        />
      </div>


    </div>
  );
};

export default SelectorSimulations;
