import { useNavigate } from 'react-router-dom';
import { useWebSocket } from '../WebSocketManager/WebSocketManager';
import { useEffect, useState } from 'react';
import Button from '../Button/Button';
import { useTranslation } from 'react-i18next';
import Footer from '../Footer/Footer';
import Header from '../Header/Header';
import SimulationList from './SimulationList';
const SelectorSimulations = () => {
  const { ws, isWsConnected, gama, simulationList } = useWebSocket();
  const [directoryPath, setDirectoryPath] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [showCustomInput, setShowCustomInput] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<string>('Waiting for connection ...');
  const { t } = useTranslation();
  const [subProjectsList, setSubProjectsList] = useState<any[]>([]); //? unused for now, but will be used to store the sub-projects list


  let simulationList2 = [ //TODO remettre "simulationList" ça dans les brackets ligne 9, enlever cette valeur débug
    {
      "type": "catalog",
      "name":"test catalog",
      "entries": [
        {
          "type": "json_settings",
          "name": "LinkToUnity",
          "splashscreen": "learning-packages/demo/splashscreen/demoOne.png",
          "model_file_path": "./Models/Demo/Simple Player Game/DemoModelVR.gaml",
          "experiment_name": "vr_xp",
          "minimal_players": "0",
          "maximal_players": "4",
          "selected_monitoring": "gama_screen"
        },
        {
          "type": "json_settings",
          "name": "Quang Binh Flood Project",
          "splashscreen": "learning-packages/quangbinhmodel/includes/splashscreen/screen.png",
          "model_file_path": "./models/version 2/Flooding VR2.gaml",
          "experiment_name": "Launch", 
          "minimal_players": "0", 
          "maximal_players": "1", 
          "selected_monitoring": "gama_screen"
        },    {
          "type": "catalog",
          "entries": [
            {
              "type": "json_settings",
              "name": "Quang Binh Flood Project",
              "splashscreen": "learning-packages/quangbinhmodel/includes/splashscreen/screen.png",
              "model_file_path": "./models/version 2/Flooding VR2.gaml",
              "experiment_name": "Launch", 
              "minimal_players": "0", 
              "maximal_players": "1", 
              "selected_monitoring": "gama_screen"
            },
          ]
        }
        
         

      ]
    },
    {
      "type": "catalog",
      "entries": [
        {
          "type": "json_settings",
          "name": "LinkToUnity",
          "splashscreen": "learning-packages/demo/splashscreen/demoOne.png",
          "model_file_path": "./Models/Demo/Simple Player Game/DemoModelVR.gaml",
          "experiment_name": "vr_xp",
          "minimal_players": "0",
          "maximal_players": "4",
          "selected_monitoring": "gama_screen"
        },
      ]
    },
    {
      "type": "json_settings",
      "name": "LinkToUnity",
      "splashscreen": "learning-packages/demo/splashscreen/demoOne.png",
      "model_file_path": "./Models/Demo/Simple Player Game/DemoModelVR.gaml",
      "experiment_name": "vr_xp",
      "minimal_players": "0",
      "maximal_players": "4",
      "selected_monitoring": "gama_screen"
    }

  ]

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
    console.log("[SELECTOR SIMULATION] handle simulation, initial index log:" ,index);

    if (!isWsConnected || ws == null) {
      console.log("Websocket not connected")
      return;
    }

    if (subProjectsList.length <= 0) { //no subproject is selected
      if (simulationList[index].type == "catalog") { //?  we additionaly check if the simulation is a catalog, not necessary but allows for adding extra types
        //@ts-ignore                                                                                ↓ this is a catalog, which means it must have an "entries" attribute
        console.log(`[HANDLE SIMULATION]: catalog detected, subprojectList: ${JSON.stringify(simulationList[index].entries)}`);
        try {
          //@ts-ignore        ↓ this is a list, so assigning it to another list should be fine
          setSubProjectsList(simulationList[index].entries);
          console.log("[SELECTOR SIMULATION] handlesimulation, simulationList[index].type == catalog", subProjectsList[index].name);
        } // in any case, we catch the error and log it if any
        catch (e) { console.log("no subprojects", e); }
      }else if (simulationList[index].type == "json_settings") {

        // ws.send(JSON.stringify({ type: 'get_simulation_by_index', simulationIndex: index }));
        console.log("[SELECTOR SIMULATIONS] json settings, subproject.length = 0",simulationList[index])
        ws.send(JSON.stringify({ type: 'send_simulation', simulation: simulationList[1] }));
        setTimeout(() => {
          navigate('/simulationManager');
        }, 100);
      }
      // ---------------------------------------------------------  sub project selected
    } else if (subProjectsList.length > 0) {
      if (subProjectsList[index].type == "json_settings") {
        ws.send(JSON.stringify({ type: 'send_simulation', simulation: subProjectsList[index] }));
        setTimeout(() => {
          navigate('/simulationManager');
        }, 100);

      } else {
        if (subProjectsList[index].type == "catalog") {
          console.log(`[HANDLE SIMULATION]: catalog detected, subprojectList: ${JSON.stringify(subProjectsList[index].entries)}`);
          try {
            //@ts-ignore        ↓ this is a list, so assigning it to another list should be fine
            setSubProjectsList(subProjectsList[index].entries);
            console.log("[SELECTOR SIMULATION] handlesimulation, simulationList[index].type == catalog", subProjectsList[0].name);
          } // in any case, we catch the error and log it if any
          catch (e) {
            console.log("no subprojects", e);
          }
        } 
      }
    }
  };

// Loop which try to connect to Gama
useEffect(() => {
  let interval: NodeJS.Timeout;

  if (ws && !gama.connected) {
    interval = setInterval(() => {
      ws.send(JSON.stringify({ type: 'try_connection' }));
      console.log('Tentative de connexion à Gama...');
    }, 3000);
  }

  return () => {
    clearInterval(interval);
  };
}, [ws, gama.connected]);

// Display connexion status
useEffect(() => {
  if (gama.connected) {
    setConnectionStatus('');
  } else {
    setConnectionStatus(t('loading')); // Pass the translated string directly
  }
}, [gama.connected, t]);

return (
  <div className="flex flex-col items-center justify-between h-full">

    <Header needsMiniNav />
    {/* ↑ prop to specify whether it should use the small version of the navigation bar */}



    {loading ? (
      <div className="text-center">
        <div className="animate-pulse ease-linear rounded-full border-8 border-t-8 border-gray-200 h-24 w-24 mb-4 -z-50"></div>

        <h2 className="text-gray-700">{t('loading')}</h2>

      </div>
    ) : (

      // Subproject group display card
      <div className="flex flex-col items-center justify-center w-5/6 h-2/3 rounded-md relative" style={{ "backgroundColor": "#A1D2FF" }}>
        {subProjectsList.length > 0 ? <div
          className={`bg-white shadow-lg rounded-xl p-6 flex flex-col items-center size-12 cursor-pointer ${!gama.connected ? 'opacity-50 cursor-not-allowed' : ''
            }`}

          style={{
            backgroundImage: `url(/images/codecode.png)`,
            backgroundSize: 'cover',
            width: '48px',
            height: '48px',
            zIndex: 1,
            position: 'absolute',
            top: '10px',
            left: '10px',
          }}
          onClick={() => setSubProjectsList([])}
        >


        </div> : null}
        {subProjectsList.length > 0 ? <h2>{t('select_subproject')}</h2> : <h2>{t('select_simulation')} </h2>}

        {/* //TODO add translation for Thai language */}

        <div className="flex items-center justify-between">

          <div className="flex mt-5 mb-8" style={{ gap: '55px' }}>
            {subProjectsList.length > 0 ?
              <SimulationList list={subProjectsList} handleSimulation={handleSimulation} gama={gama} />
              : <SimulationList list={simulationList} handleSimulation={handleSimulation} gama={gama} />}
          </div>

          {/* Right Button from the grid 
          //TODO unused dev mode, remove it maybe ?
          */}
          {/* {import.meta.env.VITE_APP_ENV === 'development' && (
            <div className="ml-20 ">

              <div
              className={`bg-white shadow-lg rounded-3xl p-6 flex flex-col items-center h-40 cursor-pointer ${
                !gama.connected ? 'opacity-50 cursor-not-allowed' : ''
              }`}                
              
              style={{
                  backgroundImage: `url(/images/codecode.png)`,
                  backgroundSize: 'cover',
                  width: '100px',
                  height: '100px',
                  marginBottom:'13px'
                }}
                // key={index}
                onClick={() => setShowCustomInput(!showCustomInput)}
                
              >
                <h2
                  className="text-gray-500 text-sm text-center"
                  style={{
                    marginTop: '80px',
                  }}
                >
                  DevMode
                </h2>
              </div>

            </div>
          )} */}
        </div>


        {/* Display the status, ask for the user to connect to Gama if still not */}
        <div className='flex gap-2 mt-6'>
          <span className={gama.connected ? 'text-green-500' : 'text-red-500'}>
            {gama.connected ? '' : connectionStatus}
          </span>

        </div>

      </div>


    )}


    {/* Show hidden sections*/}
    {showCustomInput && (

      // Section: path to start a simulation
      <div className="mt-4 w-full" style={{ marginTop: '20px', marginBottom: '-25px' }} >

        <h1 className="text-lg font-bold mb-4"> {t('enter_path')} </h1>
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
          text={t('launch_path')}
          bgColor="bg-green-500"
          showText={true}
        />


        {/* // Section: Get simulation informations */}
        <div className="mt-7">
          <h1 className="text-lg font-bold mb-5"> {t('get_sim_infos')} </h1>
          <Button
            onClick={() => {
              if (isWsConnected && ws !== null) {
                ws.send(JSON.stringify({ type: 'get_simulation_informations' }));
              } else {
                console.error('WebSocket is not connected');
              }
            }}
            text={t('get_sim_infos')}
            bgColor="bg-green-500"
            showText={true}
          />
        </div>
      </div>

    )}



    <Footer />
  </div>
);
};

export default SelectorSimulations;
