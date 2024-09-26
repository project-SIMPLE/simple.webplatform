import React, { useState, useEffect } from 'react';
import Button from '../Button/Button';
import VRHeadset from '../VRHeadset/VRHeadset';
import { useWebSocket } from '../WebSocketManager/WebSocketManager';
import { useNavigate } from 'react-router-dom';
import { useScreenModeState, useScreenModeSetter } from '../ScreenModeContext/ScreenModeContext';
import MiniNavigation from '../Navigation/MiniNavigation';

interface Player {
  connected: boolean;
  date_connection: string;
  in_game: boolean;
}

const SimulationManager: React.FC = () => {
  const { ws, gama, playerList, selectedSimulation, isWsConnected } = useWebSocket(); // `removePlayer` is now available
  const navigate = useNavigate();
  const [userInfos, setUserInfos] = useState<Player | null>(null);
  const [clickedUserInfos, setClickedUserInfos] = useState<boolean>(false);
  const [showPopUp, setShowPopUp] = useState(false);
  const [showPopUpHeadset, setShowPopUpHeadset] = useState(false);

  // const {setScreenModeDisplay, screenModeDisplay } = useScreenMode();
  // Separate hooks for reading and updating screenModeDisplay
  const screenModeDisplay = useScreenModeState();
  const setScreenModeDisplay = useScreenModeSetter();
  
  // Comparaison between players from the simulationList and the maximal/minimal players
  const detectedPlayers = Object.keys(playerList); // List Detected Players
  const maxPlayers = selectedSimulation?.maximal_players || 0;
  const minPlayers = selectedSimulation?.minimal_players || 0;
  
  const [showPopUpManageHeadset, setshowPopUpManageHeadset] = useState(false);

  // Calcul du nombre de casques non détectés (casques vides)
  const remainingPlayers = Number(maxPlayers) - detectedPlayers.length;


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

  // Choice for the ICON :
  const icon = gama.experiment_state === 'LAUNCHING'  ? (
    <svg
      className="w-7 h-7"
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
      className="w-7 h-7 "
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
      className="w-7 h-7"
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

  const togglePopUpshowPopUpManageHeadset = () => {
    setshowPopUpManageHeadset(!showPopUpManageHeadset);
  };
  
  const togglePopUp = (mode?: string) => {
    if (mode) {
      setScreenModeDisplay(mode); // Update screenModeDisplay from the context
      console.log(`Selected mode: ${mode}, current screenModeDisplay: ${screenModeDisplay}`);
    }
    setShowPopUp(!showPopUp); // Toggle pop-up visibility
  };
  
  useEffect(() => {
    if (!selectedSimulation) {
      navigate('/');
    }
  }, [selectedSimulation, navigate]);



// Générer une liste complète de casques (connectés + vides)
const playerHeadsets = [
  ...detectedPlayers.map((key) => ({
    id: key,
    connected: playerList[key].connected,
  })),
  ...Array(remainingPlayers).fill({ connected: false }), // Remplir les casques non détectés
];

// add automatically player_headset
useEffect(() => {
  if (isWsConnected && ws !== null) {
    Object.keys(playerList).forEach((key) => {
      // const player = playerList[key];

      // reconnect player only if in game , if not mean that player has been removed
      // if (player.in_game === true) {
        ws.send(JSON.stringify({ type: 'add_player_headset', id: key }));
        // }
    });
  }
}, [playerList, isWsConnected, ws]);

  // Handler for removing players
  const handleRemove = (id: string) => {
    if (ws !== null) {
      console.log(`ID headset ${id}`);
      ws.send(JSON.stringify({ "type": "remove_player_headset", id }));
     // removePlayer(id);  // already did in WebSocketManagers
     togglePopUpshowPopUpManageHeadset();
    } else {
      console.error('WebSocket is not connected');
    }
  };

  // Method launch button hide , at the bottom of this component 
  const handleGetPlayers = () => {
    if (ws !== null) {
      console.log('Player list:', playerList);
    } else {
      console.error('WebSocket is not connected');
    }
  };

  const handleRestart = (id: string) => {
    console.log(`Restart button clicked for headset ${id}`);
    // Logic for restart button
  };


  return (
    <div className="flex flex-col min-h-screen bg-gray-100">
      {/* <Navigation /> */}
      <MiniNavigation />
      <div className="flex flex-col items-center justify-center bg-gray-100 bg-white p-8 pt-0  shadow-lg rounded-lg text-center mt-12" style={{marginRight:'60px', marginLeft:'60px', marginTop:'100px'}}>
        
        
        {selectedSimulation ? (
          
          
          <div>
            
          <div className="text-3xl mb-4">{selectedSimulation.name}</div>

            <div className="flex justify-center mt-8 space-x-4 mb-7">
              
              {/*Display Headset Connected */}
              {Object.keys(playerList).map((key) => {
                const player = playerList[key];
                return (
                  <div key={key} className="flex flex-col items-center">
                    
                    <VRHeadset
                      key={key}
                      selectedPlayer={player}  
                    />
                    
                      {showPopUpManageHeadset && (
                        <>
                          {/* Grey Overley */}
                          <div className="fixed inset-0 bg-gray-800 bg-opacity-75 z-50"></div>
  
                          <div className="fixed inset-0 flex items-center justify-center z-50">
                            <div className="bg-white p-6 rounded-lg shadow-lg w-72 text-center">
                              <h2 className="text-lg font-semibold mb-4"> 
                                Do you really want to  disconnect and remove {key} ? 
                              </h2>
                              
                              <div className='flex gap-5 ml-3'>
                              
                              <button
                                className="bg-red-500 text-white px-4 py-2 mt-4 rounded"
                                onClick={() => handleRemove(key)}
                              >
                                Remove
                              </button>

                              <button
                                className="bg-orange-500 text-white px-4 py-2 mt-4 rounded"
                                onClick={() => handleRestart(key)}
                              >
                                Relaunch
                              </button>

                              </div>


  
                              <button
                                className="bg-red-500 text-white px-4 py-2 mt-6 rounded"
                                onClick={togglePopUpshowPopUpManageHeadset}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                      
                      {/* The trash */}
                    <div className='flex gap-3 mt-2'> 
                      <p style={{ marginTop: '3px' }}> {key} </p>
                      <Button  
                        bgColor='bg-red-500'
                        icon={
                          <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="18" height="18" viewBox="0 0 48 48">
                          <path fill="#FFFFFF" d="M 24 4 C 20.491685 4 17.570396 6.6214322 17.080078 10 L 10.238281 10 A 1.50015 1.50015 0 0 0 9.9804688 9.9785156 A 1.50015 1.50015 0 0 0 9.7578125 10 L 6.5 10 A 1.50015 1.50015 0 1 0 6.5 13 L 8.6386719 13 L 11.15625 39.029297 C 11.427329 41.835926 13.811782 44 16.630859 44 L 31.367188 44 C 34.186411 44 36.570826 41.836168 36.841797 39.029297 L 39.361328 13 L 41.5 13 A 1.50015 1.50015 0 1 0 41.5 10 L 38.244141 10 A 1.50015 1.50015 0 0 0 37.763672 10 L 30.919922 10 C 30.429604 6.6214322 27.508315 4 24 4 z M 24 7 C 25.879156 7 27.420767 8.2681608 27.861328 10 L 20.138672 10 C 20.579233 8.2681608 22.120844 7 24 7 z M 11.650391 13 L 36.347656 13 L 33.855469 38.740234 C 33.730439 40.035363 32.667963 41 31.367188 41 L 16.630859 41 C 15.331937 41 14.267499 40.033606 14.142578 38.740234 L 11.650391 13 z M 20.476562 17.978516 A 1.50015 1.50015 0 0 0 19 19.5 L 19 34.5 A 1.50015 1.50015 0 1 0 22 34.5 L 22 19.5 A 1.50015 1.50015 0 0 0 20.476562 17.978516 z M 27.476562 17.978516 A 1.50015 1.50015 0 0 0 26 19.5 L 26 34.5 A 1.50015 1.50015 0 1 0 29 34.5 L 29 19.5 A 1.50015 1.50015 0 0 0 27.476562 17.978516 z"></path>
                        </svg>
                        
                              } 
                          onClick={togglePopUpshowPopUpManageHeadset}
                          // onClick={() => handleRemove(key)}
                      >

                      </Button>
                    </div>
                  </div>
                );
              })}


              {/* Display remaining headsets in gray if the number of detected players is less than the maximum number */}
              {Array.from({ length: Number(maxPlayers) - Object.keys(playerList).length }).map((_, index) => (
                <div key={`placeholder-${index}`} className="flex flex-col items-center opacity-50 cursor-not-allowed">
                  <VRHeadset  />
                  <p style={{ marginTop: '3px' }}>Empty slot</p>
                  {/* <p>Waiting for connection...</p> */}
                </div>
              ))}

            
            
            </div>
              
            <div>  

              <p className="flex items-center align-center" style={{marginLeft:'90px'}}>
                Waiting for {Number(maxPlayers) - Object.keys(playerList).length} more players to reach maximum players 
                <svg className="animate-spin ml-2 h-5 w-5 text-gray-800" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
              </p>

              {/* <p>Minimal players needed to launch the simulation: {minPlayers}</p> */}

              {/* <p className='b-2'>Waiting for {Number(maxPlayers) - Object.keys(playerList).length } more players ...</p> */}
            </div>

          {/* Buttons Simulations : Play Button, Pause Button, Stop Button  */}


          <div>
          
            <div>
              {gama.experiment_state === 'NONE' || gama.experiment_state === 'NOTREADY' ? (
                Object.keys(playerList).length >= Number(minPlayers) ? (
                  <div className="flex justify-center space-x-2 gap-10 mb-5 mt-5">
                    <Button
                      onClick={handlePlayPause}
                      customStyle={{ width: '100px', height: '50px'}}
                      bgColor="bg-green-500"
                      showText={true}
                      text="Begin Anyway"
                    />
                  </div>
                ) : null    
              ) : (
                  // If the state is "PAUSED", "LAUNCHING", or "RUNNING", display the buttons normally
                gama.experiment_state === 'PAUSED' ||
                gama.experiment_state === 'LAUNCHING' ||
                gama.experiment_state === 'RUNNING' ? (
                  <>
                  
                  <div className="flex justify-center space-x-2 gap-10 mb-5 mt-5">
                    <Button
                      onClick={handlePlayPause}
                      customStyle={{ width: '100px', height: '50px' }}
                      bgColor={
                        gama.experiment_state === 'RUNNING'
                          ? 'bg-orange-500'
                          : 'bg-green-500'
                      }
                      icon={icon}
                      showText={true}
                    />
                    <Button
                      onClick={handleEnd}
                      className="w-20"
                      customStyle={{ width: '100px', height: '50px' }}
                      bgColor="bg-red-500"
                      icon={
                        <svg
                          className="w-7 h-7"
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
                      showText={true}
                    />
                    


                </div>
                    <div className='flex justify-center mt-3 gap-4'>
                    <Button
                      text="Gama screen"
                      bgColor="bg-white"
                      showText={true}
                      className='border-1 border-black'
                      icon={
                        <img src="/images/gama_screen.png" alt="Monitoring" style={{ width: '90px', height: '90px' }} 
                        />
                      }

                      onClick={() => togglePopUp("gama_screen")}
                    />
                    <Button
                      text="Shared Screen"
                      bgColor="bg-white"
                      showText={true}
                      className='border-1 border-black'
                      icon={
                        <img src='/images/shared_screen.png' alt="shared_screen" className="w-12" style={{ width: '90px', height: '90px' }} />
                      }
                      onClick={() => togglePopUp("shared_screen")}
                    />
                  </div>

                  </>
                  ) : null
                )}
            </div>
          </div>


            
            
          </div>
        ) : (
          <div className="text-3xl mb-4">No simulation selected</div>
        )}
      </div>

      {/* Get Player */}
      <div className="w-2/3 mt-8 grid grid-cols-2 gap-4">        
        {
        import.meta.env.VITE_APP_ENV === 'development' && (  
          <div></div>

        // BUTTON get handletGetPlayerList (debug)
        // <div>
        //   {/* <div className="text-lg mt-3 mb-3">Get Players connected:</div> */}
        //   <Button onClick={handleGetPlayers} text="Get Player list logs" bgColor="bg-purple-500" showText={true} 
            
        //     icon= {
        //       <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20">
        //         <circle cx="12" cy="12" r="10" fill="none" stroke="white" strokeWidth="2"/>
        //         <line x1="12" y1="17" x2="12" y2="12" stroke="white" strokeWidth="2"/>
        //         <circle cx="12" cy="8.5" r="1" fill="white"/>
        //       </svg>
        //     }
        //   />
        // </div>
        )}

        {/* Column 2 */}
        <div>
          { userInfos && clickedUserInfos && playerList ? (
          <div>
            <div className="text-xl mt-3 mb-3">Informations Player:</div>
            <p>Connected ? : {String(userInfos.connected)}</p>
            <p>Hour of connection : {userInfos.date_connection}</p>
            <p>Connected in game ? : {String(userInfos.in_game)}</p>
          </div>

          ) : null }
        </div>
      </div>
    
    
      {/* Footer of the page */}
      <footer className="flex justify-between items-center p-4 border-t border-gray-300  w-full" style={{ marginTop: '20px' }} >
        <div className='flex'>
          <img src="/images/global-gateway-euro.png" alt="Global Gateway" className="h-8" />
          <img src="/images/funded-by-ue.png" alt="Global Gateway" className="h-8" />
        </div>

        <div className='flex gap-3' >
          <img src="images/IRD-logo.png" alt="IRD" className="h-8" />
          <img src="images/nstda-logo.png" alt="CTU" className="h-8" />
          <img src="images/ctu-logo.png" alt="NSTDA" className="h-8" />
        </div>
      </footer>


    </div>
  );
};

export default SimulationManager;
