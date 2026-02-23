/* eslint-disable @typescript-eslint/no-unused-vars */ //! The unused var are for potential buttons to be implemented next, that allows changing the display to something that
//! accomodates the gama server map
import { useState, useEffect } from 'react';
import Button from '../Button/Button';
import VRHeadset from '../VRHeadset/VRHeadset';
import { useWebSocket } from '../WebSocketManager/WebSocketManager';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Footer from '../Footer/Footer';
import SimulationManagerPlayer from './SimulationManagerPlayer';
import x_cross from '/src/svg_logos/x_cross.svg';
import visibility from '/src/svg_logos/visibility.svg'
import Header from '../Header/Header';
import { Link } from 'react-router-dom';
import { getLogger } from '@logtape/logtape';
export interface Player {
  connected: boolean;
  date_connection: string;
  in_game: boolean;
}


const SimulationManager = () => {

  const logger = getLogger(["simulationManager", "SimulationManager"]);
  const { ws, gama, playerList, selectedSimulation } = useWebSocket(); // `removePlayer` is now available
  const navigate = useNavigate();
  const [simulationStarted, setSimulationStarted] = useState(false);
  const { t } = useTranslation();
  const [startButtonClicked, setStartButtonClicked] = useState(false);

  const startClicked = () => {
    setStartButtonClicked(true);
    handlePlayPause();

  }


  // Comparaison between players from the simulationList and the maximal/minimal players
  const detectedPlayers = Object.keys(playerList); // List Detected Players
  const maxPlayers = selectedSimulation?.maximal_players || 0;
  const minPlayers = selectedSimulation?.minimal_players || 0;




  const handlePlayPause = () => {
    if (ws !== null) {
      if (gama.experiment_state == "NONE" && !simulationStarted) {
        setSimulationStarted(true);
        logger.debug("sent message {type: launch experiment}")
        ws.send(JSON.stringify({ "type": "launch_experiment" }));
      } else if (gama.experiment_state != "NOTREADY") {
        ws.send(JSON.stringify({ "type": (gama.experiment_state != "RUNNING" ? "resume_experiment" : "pause_experiment") }));
      }
    } else {
      logger.error("WS is null");
    }
  };

  const handleEnd = () => {
    if (ws !== null) {
      ws.send(JSON.stringify({ "type": "stop_experiment" }));
      //  redirect to the main page :
      navigate('/');
    } else {
      logger.error("WS is null");
    }
  };

  // Choice for the ICON :
  const icon = gama.experiment_state === 'LAUNCHING' ? (
    <svg className="size-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 9v6m4-6v6" /> {/*  Verticals bars for "pause" */}
    </svg>

  ) : gama.experiment_state === 'NONE' || gama.experiment_state === 'NOTREADY' || gama.experiment_state === 'PAUSED' ? (
    <svg className="size-7 " fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3l14 9-14 9V3z"></path>  {/* triangle for "play" */}
    </svg>
  ) : (
    <svg className="size-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 9v6m4-6v6" />
    </svg>
  );





  useEffect(() => {
    if (!selectedSimulation) {
      navigate('/');
    }
  }, [selectedSimulation, navigate]);

  // Handler for removing players




  return (
    <div className="flex flex-col h-full bg-slate-100 justify-between">
      <Header needsMiniNav={true} />
      <div className="flex flex-col items-center justify-center rounded-lg text-center h-2/3 mx-16 " style={{ backgroundColor: "#A1D2FF" }}>


        {selectedSimulation ? (


          <div>

            <h1 className="text-3xl mb-4">{selectedSimulation.name}</h1>

            <div className="flex justify-center items-center  space-x-4 ">

              {/*Display Headset Connected */}
              {Object.keys(playerList).map((key) => {
                const player = playerList[key];
                return (

                  <div key={key} className="flex flex-col items-center" >

                    <SimulationManagerPlayer
                      Playerkey={key}
                      selectedPlayer={player}
                      playerId={key}
                    />
                  </div>




                );
              })}


              {/* //!       Display remaining headsets in gray if the number of detected players is less than the maximum number of players */}
              {Array.from({ length: Number(maxPlayers) - Object.keys(playerList).length }).map((_, index) => (
                <div key={`placeholder-${index}`} className="flex flex-col items-center opacity-50 cursor-not-allowed">
                  <VRHeadset />
                </div>
              ))}



            </div>



            {/* Buttons Simulations : Play Button, Pause Button, Stop Button  */}

            <>
              <div>
                {gama.experiment_state === 'NONE' || gama.experiment_state === 'NOTREADY' ? (

                  detectedPlayers.length < Number(minPlayers) ? (

                    <p className="flex items-center align-center" style={{ marginLeft: '90px' }}>
                      {t('wait_minim_players_1')} {Number(minPlayers) - Object.keys(playerList).length} {t('wait_minim_players_2')}
                      <svg className="animate-spin ml-2 h-5 w-5 text-gray-800" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                      </svg>

                    </p>


                  ) : Object.keys(playerList).length >= Number(minPlayers) && Object.keys(playerList).length < Number(maxPlayers) ? (
                    <>
                      <p className="flex items-center align-center" style={{ marginLeft: '90px' }}>
                        {t('wait_minim_players_1')} {Number(maxPlayers) - Object.keys(playerList).length} {t('wait_maximum_players_1')}
                        <svg className="animate-spin ml-2 h-5 w-5 text-gray-800" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                        </svg>
                      </p>

                      <div className="flex justify-center space-x-2 gap-10 mb-4 mt-4 ">
                        <Button
                          onClick={startClicked} //set the maximum height to be twice the size of the font size
                          customStyle={{ maxWidth: '150', maxHeight: '2.4em', wordWrap: "break-word" }}
                          bgColor={startButtonClicked ? "bg-yellow-300" : "bg-green-500"}
                          showText={true}
                          text={startButtonClicked ? t('simulation_loading') : t('button_begin_anyway')}
                          icon={startButtonClicked ? <svg className="animate-spin ml-2 h-5 w-5 text-gray-800" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                          </svg> : null
                          } />


                        <Link to={"../streamPlayerScreen"} className='bg-white rounded-lg' target='_blank'>
                          <Button bgColor='bg-purple-500'
                            text="VR screens"
                            icon={<img src={visibility} />}
                            className='flex w-15'

                          ></Button>
                        </Link>
                      </div>
                    </>
                  ) : ( // Autostart simulation
                    <>
                      {
                        Object.keys(playerList).length >= Number(maxPlayers) && handlePlayPause() // Call handlePlayPause function here
                      }
                    </>
                  )
                ) : gama.experiment_state === 'PAUSED' ||
                  gama.experiment_state === 'LAUNCHING' ||
                  gama.experiment_state === 'RUNNING' ? (
                  <>
                    <div className="flex justify-center space-x-2 gap-10 mb-4 mt-4">
                      <Button
                        onClick={handlePlayPause}
                        customStyle={{ width: '100px', height: '50px' }}
                        bgColor={gama.experiment_state === 'RUNNING' ? 'bg-orange-500' : 'bg-green-500'}
                        icon={icon}
                        showText={true}
                      />
                      <Button
                        onClick={handleEnd}
                        className="w-20"
                        customStyle={{ width: '100px', height: '50px' }}
                        bgColor="bg-red-500"
                        icon={<img src={x_cross}
                          style={{ width: "50px", height: "50px" }} />}
                        showText={true}
                      />
                      <Link to={"../streamPlayerScreen"} className=' rounded-lg'>
                        <Button bgColor='bg-purple-500 h-full'
                          text="VR displays"
                          icon={<img src={visibility} />}
                          className='flex w-15 h-full'
                        ></Button>
                      </Link>
                    </div>
                  </>
                )}

              </div>
            </>




          </div>
        ) : (
          <div className="text-3xl mb-4">No simulation selected</div>
        )}
      </div>




      {/* Footer of the page */}
      <Footer />


    </div>
  );
};

export default SimulationManager;
