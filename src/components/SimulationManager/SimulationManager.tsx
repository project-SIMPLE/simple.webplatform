//! accomodates the gama server map
import { useState, useEffect, useRef } from 'react';
import VRHeadset from '../VRHeadset/VRHeadset';
import { useWebSocket } from '../WebSocketManager/WebSocketManager';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Footer from '../Footer/Footer';
import SimulationManagerPlayer from './SimulationManagerPlayer';
import Header from '../Header/Header';
import { Link } from 'react-router-dom';
import { getLogger } from '@logtape/logtape';
import { wsApi } from '../../common/wsApi';

const SimulationManager = () => {

  const logger = getLogger(["simulationManager", "SimulationManager"]);
  const { ws, gamaless, gama, playerList, selectedSimulation } = useWebSocket(); // `removePlayer` is now available
  const navigate = useNavigate();
  const [simulationStarted, setSimulationStarted] = useState(false);
  const { t } = useTranslation();
  // Comparaison between players from the simulationList and the maximal/minimal players
  const detectedPlayers = Object.keys(playerList); // List Detected Players
  const maxPlayers = selectedSimulation?.maximal_players || 0;
  const minPlayers = selectedSimulation?.minimal_players || 0;

  // Navigate back to home when GAMA closes the experiment from its side
  // (mirrors the behaviour of the Stop button, which calls navigate('/') immediately)
  const prevExperimentStateRef = useRef<string>(gama.experiment_state);
  useEffect(() => {
    const prev = prevExperimentStateRef.current;
    prevExperimentStateRef.current = gama.experiment_state;

    if (
      !gamaless &&
      simulationStarted &&
      ['RUNNING', 'PAUSED', 'LAUNCHING'].includes(prev) &&
      ['NONE', 'NOTREADY'].includes(gama.experiment_state)
    ) {
      navigate('/');
    }
  }, [gamaless, simulationStarted, gama.experiment_state, navigate]);

  // Auto-start simulation when max players reached — only fires once per session
  useEffect(() => {
    if (
      !gamaless &&
      !simulationStarted &&
      gama.experiment_state === 'NONE' &&
      detectedPlayers.length >= Number(maxPlayers) &&
      Number(maxPlayers) > 0 &&
      ws !== null
    ) {
      setSimulationStarted(true);
      logger.debug("sent message {type: launch experiment}");
      wsApi.launchExperiment(ws);
    }
  }, [gamaless, simulationStarted, gama.experiment_state, detectedPlayers.length, maxPlayers, ws]);




  const handlePlayPause = () => {
    if (ws !== null) {
      if (gama.experiment_state == "NONE" && !simulationStarted) {
        setSimulationStarted(true);
        logger.debug("sent message {type: launch experiment}")
        wsApi.launchExperiment(ws);
      } else if (gama.experiment_state != "NOTREADY") {
        if (gama.experiment_state != "RUNNING") {
          wsApi.resumeExperiment(ws);
        } else {
          wsApi.pauseExperiment(ws);
        }
      }
    } else {
      logger.error("WS is null");
    }
  };

  const handleEnd = () => {
    if (ws !== null) {
      wsApi.stopExperiment(ws);
      //  redirect to the main page :
      navigate('/');
    } else {
      logger.error("WS is null");
    }
  };




  useEffect(() => {
    if (!gamaless && !selectedSimulation) {
      navigate('/');
    }
  }, [gamaless, selectedSimulation, navigate]);

  // Handler for removing players




  return (
    <div className="flex flex-col h-full justify-between">
      <Header />
      <div className="flex flex-col items-center justify-center rounded-lg text-center h-2/3 mx-16">


        {selectedSimulation ? (


          <div>

            <h1 className="text-3xl mb-4">{selectedSimulation.name}</h1>

            <div className="flex justify-center items-center  space-x-4 ">

              {/*Display Headset Connected */}
              {Object.keys(playerList).map((key) => {
                const player = playerList[key];
                return (
                  <SimulationManagerPlayer
                    key={key}
                    Playerkey={key}
                    selectedPlayer={player}
                    playerId={key}
                  />
                );
              })}

              {/* //!       Display remaining headsets in transparent orange if the number of detected players is less than the maximum number of players */}
              {Array.from({ length: Number(maxPlayers) - Object.keys(playerList).length }).map((_, index) => (
                <div key={`placeholder-${index}`} className="flex flex-col items-center cursor-not-allowed">
                  <VRHeadset />
                </div>
              ))}
            </div>

            {/* Buttons Simulations : Play Button, Pause Button, Stop Button  */}

            {gamaless ? (
              <div className="mt-4 px-4 py-2 bg-yellow-100 border-2 border-yellow-400 rounded-lg text-yellow-800 text-sm text-center">
                GAMALESS — simulation controls disabled
              </div>
            ) : (
            
              <div className='relative flex flex-col items-center justify-center gap-4'>
                {gama.experiment_state === 'NONE' || gama.experiment_state === 'NOTREADY' ? (

                  detectedPlayers.length < Number(minPlayers) ? (

                    <p className="flex items-center align-center" style={{ marginLeft: '90px' }}>
                      {t('wait_minim_players_1')} {Number(minPlayers) - Object.keys(playerList).length} {t('wait_minim_players_2')}
                      <img src={` /images/Headset_condition/Headset_condition_connecting.png`} className="size-8 right-0 bottom-0 animate-spin" alt="headset connecting" />
                    </p>


                  ) : Object.keys(playerList).length >= Number(minPlayers) && Object.keys(playerList).length < Number(maxPlayers) ? (
              <>
                <p className="flex items-center w-fit">
                  {t('wait_minim_players_1')} {Number(maxPlayers) - Object.keys(playerList).length} {t('wait_maximum_players_1')}
                  <img src={` /images/Headset_condition/Headset_condition_connecting.png`} alt="" className='size-5 ml-2 animate-spin'/>
                </p>

                <div className="flex justify-center space-x-2 gap-10 mb-4 mt-4 ">
                    <div>
                   <img src={` /images/Buttons/Button_play.png`} className='cursor-pointer size-[6dvh] hover:scale-110 transition-transform duration-200' onClick={handlePlayPause} alt="" />
                  {/* <img src={` /images/Headset_condition/Headset_condition_connecting.png`} alt="" className='size-[65px] ml-2 animate-spin absolute bottom-[5px] right-[280px] '/> */}

                    </div>
                      



                  <Link to={"../streamPlayerScreen"} className='rounded-lg' target='_blank'>
                    <img src={` /images/Buttons/Button_Display.png`} alt="display button" className='size-[6dvh] hover:scale-110 transition-transform duration-200' />
                  </Link>
                </div>
              </>
              ) : ( // Autostart simulation — handled by useEffect above
              <>
                <p className="flex items-center w-fit">
                  {t('all_players_connected')}
                  <img src={`/images/Headset_condition/Headset_condition_connected.png`} alt="" className='size-5 ml-2'/>
                </p>
              </>
              )
              ) :

              (

              <div className="flex justify-center space-x-2 gap-10 mb-4 mt-4">
                {gama.experiment_state === 'PAUSED' &&
                  <img src={` /images/Buttons/Button_play.png`} alt="play button" onClick={handlePlayPause} className='cursor-pointer size-[6dvh] hover:scale-110 transition-transform duration-200' />
                }
                {(gama.experiment_state === 'RUNNING' || gama.experiment_state === 'LAUNCHING') &&
                  <img src={` /images/Buttons/Button_pause.png`} alt="play button" onClick={handlePlayPause} className='cursor-pointer size-[6dvh] hover:scale-110 transition-transform duration-200' />
                }
                <img src={` /images/Buttons/Button_stop.png`} alt="" onClick={handleEnd} className='cursor-pointer size-[6dvh] hover:scale-110 transition-transform duration-200' />
                <Link to={"../streamPlayerScreen"} className=' rounded-lg'>
                  <img src={` /images/Buttons/Button_Display.png`} alt="streaming displays button" className='cursor-pointer hover:scale-110 transition-transform duration-200 size-[6dvh]' />
                </Link>
              </div>

                  )}

              </div>
            
            )}




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
