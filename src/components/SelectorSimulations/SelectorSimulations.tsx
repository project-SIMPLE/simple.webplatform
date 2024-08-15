
import { Link } from 'react-router-dom';
import { useWebSocket } from '../WebSocketManager/WebSocketManager';
import React, { useEffect } from 'react';
import Button from '../Button/Button';


const SelectorSimulations = () => {

  const { ws, gama, playerList } = useWebSocket();
  
  // useEffect(() => {
  //   console.log('Player List Tuan:', playerList);
  // } , [playerList]);

  // useEffect(() => {
  //   console.log('Gama Tuan:', gama);
  // }, [gama]);

  // useEffect(() => {
  //   console.log('WebSocket Tuan :', ws);
  // }, [ws]);


  function handleSendInformations(): void {
    if(ws !== null){
      ws.send(JSON.stringify({"type": "get_simulation_informations"}));
    }else{
      console.error("WS is null");
  }  }

    
  return (

    // plus tard affiche dynamique des simulations
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-8">
      <h1 className="text-4xl font-bold mb-8">Simulations</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        
        <Link to="/" className='text-black'>
            <div className="bg-white shadow-lg rounded-lg p-6 flex flex-col items-center h-64">
            <h2 className="text-2xl font-semibold mb-4">Simulation 1</h2>
            <p className="text-gray-500">Description of Simulation 1 goes here. It's a brief overview of what the simulation is about.</p>
            </div>
        </Link>

        <Link to="/" className='text-black'>
            <div className="bg-white shadow-lg rounded-lg p-6 flex flex-col items-center h-64">
            <h2 className="text-2xl font-semibold mb-4">Simulation 2</h2>
            <p className="text-gray-500">Description of Simulation 2 goes here. It's a brief overview of what the simulation is about.</p>
            </div>
        </Link>
        
        <Link to="/" className='text-black'>
            <div className="bg-white shadow-lg rounded-lg p-6 flex flex-col items-center h-64">
            <h2 className="text-2xl font-semibold mb-4">Simulation 3</h2>
            <p className="text-gray-500">Description of Simulation 3 goes here. It's a brief overview of what the simulation is about.</p>
            </div>
        </Link>

      </div>
      <Button onClick={handleSendInformations} text="Get Simulations Informations" bgColor="bg-green-500" icon={
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
    </div>
  );
};

export default SelectorSimulations;
