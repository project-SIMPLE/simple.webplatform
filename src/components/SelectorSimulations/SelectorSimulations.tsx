import { useNavigate } from 'react-router-dom';
import { useWebSocket } from '../WebSocketManager/WebSocketManager';
import { useEffect, useState } from 'react';
import Button from '../Button/Button';
import { useTranslation } from 'react-i18next';
import Footer from '../Footer/Footer';
import Header from '../Header/Header';
import SimulationList from './SimulationList';
import arrow_back from "/src/svg_logos/arrow_back.svg";
const SelectorSimulations = () => {
  const { ws, isWsConnected, gama, simulationList } = useWebSocket();
  const [directoryPath, setDirectoryPath] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [connectionStatus, setConnectionStatus] = useState<string>('Waiting for connection ...');
  const { t } = useTranslation();
  const [subProjectsList, setSubProjectsList] = useState<any[]>([]); //? unused for now, but will be used to store the sub-projects list
  const [selectedSplashscreen, setSelectedSplashscreen] = useState("")
  const [path, setPath] = useState<number[]>([]);


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
      if (simulationList.length === 1) {
        simulationList
      }
    }
  }, [simulationList]);


  useEffect(() => {
    // the path here is a list of nested indexes, which are used to see which catalogs the user clicked
    if (path.length > 0) {
      let list = simulationList
      for (const index of path) {
        console.log("index in the use effect:", index)
        //@ts-ignore
        if (list[index].entries.length > 0) {
          //@ts-ignore
          list = list[index].entries
        } else {
          //@ts-ignore
          list = list[index]
        }
        setSubProjectsList(list)
      }
    }
  })


  const addToPath = (index: number) => {
    setPath([...path, index])
  }

  const back = () => {
    if (path.length > 1) {
      setPath([...path.slice(0, -1)])
    }
    if (path.length === 1) {
      setPath([])
      setSubProjectsList([])
    }
  }
  /**
   * handles either navigating through the list of projects or launch a simulation
   * @param index index of the current selected element
   */
  const handleSimulation = (index: number) => {

    if (!isWsConnected || ws === null) {
      console.log("Websocket not connected: !wsIsconnected or ws null", isWsConnected, ws)
      return;
    }

    if (subProjectsList.length <= 0) { //no subproject is selected, we either enter a folder or launch a simulation
      if (simulationList[index].type == "catalog") { //?  we additionaly check if the simulation is a catalog, not necessary but allows for adding extra types
        //@ts-ignore                                                                                ↓ this is a catalog, which means it must have an "entries" attribute
        console.log(`[HANDLE SIMULATION]: catalog detected, subprojectList: ${JSON.stringify(simulationList[index].entries)}`);
        try {
          //@ts-ignore        ↓ this is a list, so assigning it to another list should be fine
          setSubProjectsList(simulationList[index].entries);
          addToPath(index)
          if ('splashscreen' in simulationList[index]) { setSelectedSplashscreen(simulationList[index].splashscreen); }
          console.log("[SELECTOR SIMULATION] handlesimulation, simulationList[index].type == catalog", subProjectsList[index].name);
        }
        catch (e) { console.log("no subprojects", e); }

      } else if (simulationList[index].type == "json_settings") {
        ws.send(JSON.stringify({ type: 'send_simulation', simulation: simulationList[index] }));
        setTimeout(() => {
          navigate('/simulationManager');
        }, 100);
      } else if (Array.isArray(simulationList[index])) {
        console.log(simulationList[index].model_file_path)
        // setSubProjectsList(simulationList[index]); 
        addToPath(index)
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
          try {
            //@ts-ignore        ↓ this is a list, so assigning it to another list should be fine
            // setSubProjectsList(subProjectsList[index].entries);
            addToPath(index)
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
        console.log('Tentative de connexion à Gama... état de la connexion:');
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

        // disable  
        <div className="flex flex-col items-center justify-center w-5/6 h-2/3 rounded-md relative" style={{ "backgroundColor": "#A1D2FF" }}>

          {
            //the content of this bracket is the back button
            subProjectsList.length > 0 && path.length >= 1 ?
              <div
                className={`shadow-lg rounded-xl flex flex-col items-center absolute justify-center size-14 cursor-pointer`}

                style={{
                  backgroundImage: `url(${selectedSplashscreen ? selectedSplashscreen : "/images/simple_logo.png"})`,
                  backgroundSize: 'cover',
                  // width: '48px',
                  // height: '48px',
                  zIndex: 1,
                  // position: 'absolute',
                  top: '10px',
                  left: '10px',
                }}
                onClick={() => back()}
              >
                <img src={arrow_back} className='rounded-full bg-slate-700 opacity-75 size-8' />

              </div>
              : null}

          {subProjectsList.length > 0 ? <h2 className='font-medium'>{t('select_subproject')}</h2> : <h2>{t('select_simulation')} </h2>}

          {/* //TODO add translation for Thai language */}

          <div className="flex items-center justify-between">

            

            <div className="flex mt-5 mb-8" style={{ gap: '55px' }}>
              {subProjectsList.length > 0 ?
                <SimulationList list={subProjectsList} handleSimulation={handleSimulation} gama={gama} />
                : <SimulationList list={simulationList} handleSimulation={handleSimulation} gama={gama} />
              }

            </div>


          </div>


          {/* Display the status, ask for the user to connect to Gama if still not */}
          <div className='flex gap-2 mt-6'>
            <span className={gama.connected ? 'text-green-500' : 'text-red-500'}>
              {gama.connected ? '' : connectionStatus}
            </span>

          </div>

        </div>


      )}


      <Footer />
    </div>
  );
};

export default SelectorSimulations;
