import { useNavigate } from 'react-router-dom';
import { useWebSocket } from '../WebSocketManager/WebSocketManager';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Footer from '../Footer/Footer';
import Header from '../Header/Header';
import { Link } from 'react-router-dom';
import Button from '../Button/Button';
import SimulationList from './SimulationList';
import arrow_back from "/src/svg_logos/arrow_back.svg";
import { getLogger } from '@logtape/logtape';
import { VU_CATALOG_SETTING_JSON, VU_MODEL_SETTING_JSON } from '../../api/core/Constants';
import visibility from '/src/svg_logos/visibility.svg';
const SelectorSimulations = () => {
  const { ws, isWsConnected, gama, simulationList } = useWebSocket();
  const [loading, setLoading] = useState<boolean>(true);
  const [connectionStatus, setConnectionStatus] = useState<string>('Waiting for connection ...');
  const { t } = useTranslation();
  const [subProjectsList, setSubProjectsList] = useState<(VU_CATALOG_SETTING_JSON | VU_MODEL_SETTING_JSON)[]>(simulationList);
  useEffect(() => {
    if (simulationList && simulationList.length > 0) {
      setSubProjectsList(simulationList);
    }
  }, [simulationList]);

  const [selectedSplashscreen, setSelectedSplashscreen] = useState("")
  const [path, setPath] = useState<number[]>([]);
  const navigate = useNavigate();
  const logger = getLogger(["components", "SelectorSimulation"]);

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
        logger.debug("index in the use effect: {index}", { index })
        if (list[index].type === "catalog") {
          list = list[index].entries
        } else {
          list = [list[index]]
        }
        setSubProjectsList(list)
      }
    } else {
      setSubProjectsList(simulationList)
    }
  }, [path, simulationList])

  /**Function used to add a clicked subfolder to path
   * path is an ordered array containing the indexes of all clicked subfolders
   * @param index 
   */
  const addToPath = (index: number) => {
    setPath([...path, index])
  }

  /**Removes the last index used to travel the subproject folder
   * 
   */
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
      logger.warn("Websocket not connected \n isWsConnected:{isWsConnected}\n ws:{ws}", { isWsConnected, ws })
      return;
    }

    if (subProjectsList[index].type === "catalog") { //?  we additionaly check if the simulation is a catalog, not necessary but allows for adding extra types
      const catalog_item = subProjectsList[index];
      //we define a constant to tell typescript that the type of subProjectsList[index] cannot change and is a VU_CATALOG_SETTING_JSON, meaning that entries is defined
      logger.debug("catalog detected, subprojectList:{subprojectList}", { subProjectList: JSON.stringify(catalog_item.entries) });
      try {
        setSubProjectsList(catalog_item.entries);
        addToPath(index)
        if (simulationList[index].splashscreen !== undefined) {
          setSelectedSplashscreen(simulationList[index].splashscreen);

        } else {
          logger.warn("No splashscreen could be found for simulation {simulation}", { simulation: catalog_item.name })
        }
        logger.debug("called handle simulation, selected item is a catalog of name:{expName}", { expName: subProjectsList[index].name });
      }
      catch (e) { logger.error("no subprojects, ERROR:{e}", { e }); }

    } else if (simulationList[index].type == "json_settings") {
      ws.send(JSON.stringify({ type: 'send_simulation', simulation: simulationList[index] }));
      setTimeout(() => {
        navigate('/simulationManager');
      }, 100);

      // ---------------------------------------------------------  sub project selected

    } 
      if (subProjectsList[index].type == "json_settings") {
        ws.send(JSON.stringify({ type: 'send_simulation', simulation: subProjectsList[index] }));
        setTimeout(() => {
          navigate('/simulationManager');
        }, 100);
      } else {
        if (subProjectsList[index].type == "catalog") {
          try {
            addToPath(index)
            logger.debug("handlesimulation, simulationList[index].type == catalog, {name}", { name: subProjectsList[index].name });
          } // in any case, we catch the error and log it if any
          catch (e) {
            logger.error("no subprojects, ERROR: {e}", { e : (e as Error).message });
          }
        }
      }
    
  };

  // Loop which tries to connect to Gama
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (ws && !gama.connected) {
      interval = setInterval(() => {
        ws.send(JSON.stringify({ type: 'try_connection' }));
        logger.info('Trying to connect to GAMA, connection status: {gamaStatus}', { gamaStatus: gama.connected });
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
        <div className="flex flex-col items-center justify-center w-5/6 h-2/3 rounded-md relative" style={{ "backgroundColor": "#A1D2FF" }}>
          {
            //? Shows the back button if in a nested folder
            path.length >= 1 &&
              <div
                className={`shadow-lg rounded-xl flex flex-col items-center justify-center size-14 cursor-pointer bg-white absolute top-10 left-10`}
                onClick={() => back()}
              >
                <img src={selectedSplashscreen ? selectedSplashscreen : "/images/simple_logo.png"} alt="background image" className='absolute z-0'/>
                <img src={arrow_back} className='rounded-full bg-slate-700 size-8 z-10 opacity-70' />
              </div>
              }

          {subProjectsList ? subProjectsList.length > 0 ? <h2 className='font-medium'>{t('select_subproject')}</h2> : <h2>{t('select_simulation')} </h2> : null}

          {/* //TODO add translation for Thai language */}

          <div className="flex items-center justify-between">
            <div className="flex mt-5 mb-8" style={{ gap: '55px' }}>
                <SimulationList list={subProjectsList} handleSimulation={handleSimulation} gama={gama} />
            </div>
          </div>
          {/* Display the status, ask for the user to connect to Gama if still not */}
          <div className='flex gap-2 mt-6'>
            <span className={gama.connected ? 'text-green-500' : 'text-red-500'}>
              {gama.connected ? '' : connectionStatus}
            </span>
          </div>
          <Link to={"../streamPlayerScreen"} className='bg-white rounded-lg' target='_blank'>
            <Button bgColor='bg-purple-500'
              text="VR screens"
              icon={<img src={visibility} />}
              className='flex w-15'
            ></Button>
          </Link>
        </div>
      )}
      <Footer />
    </div>
  );
};

export default SelectorSimulations;
