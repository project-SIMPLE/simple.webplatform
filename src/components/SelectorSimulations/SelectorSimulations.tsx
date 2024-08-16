import { Link } from 'react-router-dom';
import { useWebSocket } from '../WebSocketManager/WebSocketManager';
import React, { useEffect } from 'react';
import Button from '../Button/Button';

const SelectorSimulations = () => {
  const { ws, isWsConnected, simulationList, selectedSimulation } = useWebSocket();

  useEffect(() => {
    if (isWsConnected && ws !== null) {
      ws.send(JSON.stringify({ type: 'get_simulation_informations' }));
    }
  }, [isWsConnected, ws]);

  const handleSimulation = (index: number) => {
    if (isWsConnected && ws !== null) {
      // we send the message to the WebSocket server 
      ws.send(JSON.stringify({ type: 'get_simulation_by_index', simulationIndex: index }));
    } else {                          
      console.error('WebSocket is not connected');
    }
  }

  if (isWsConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-8">
        <h1 className="text-4xl font-bold mb-8">Simulations</h1>
  
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {simulationList.map((simulation, index) => (
            <Link to="/simulationManager" className="text-black" key={index}>
              <div onClick={() => handleSimulation(index)} key={index} className="bg-white shadow-lg rounded-lg p-6 flex flex-col items-center h-64">
                <h2 className="text-2xl font-semibold mb-4">{simulation.name}</h2>
                <p className="text-gray-500">experiment name: {simulation.experiment_name}</p>
                <p className="text-gray-500">File path simulation: </p>
                <p className="text-gray-500">{simulation.model_file_path}</p>
              </div>
            </Link>
          ))}
        </div>
  
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
    );
    
  }
};

export default SelectorSimulations;
