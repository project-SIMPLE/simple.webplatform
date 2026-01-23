import VRHeadset from "../VRHeadset/VRHeadset";
import { useTranslation } from "react-i18next";
import { useState } from 'react';
import { useWebSocket } from '../WebSocketManager/WebSocketManager';
import cross from '/src/svg_logos/x_cross.svg';
import { getLogger, configure, getConsoleSink } from "@logtape/logtape";

const logger = getLogger(["components", "SimulationManagerPlayer"]);
interface PlayerProps {
  Playerkey: string
  selectedPlayer?: any;
  className?: string;
  playerId?: string;

}

const SimulationManagerPlayer = ({ Playerkey, selectedPlayer, className, playerId }: PlayerProps) => {
  const { t } = useTranslation();

  const { ws, playerList } = useWebSocket(); // `removePlayer` is now available


  const [showPopUpManageHeadset, setshowPopUpManageHeadset] = useState(false);

  const toggleShowPopUpManageHeadset = () => {
    setshowPopUpManageHeadset(!showPopUpManageHeadset);
  };

  const handleRemove = (id: string) => {
    if (ws !== null) {
      logger.info("ID headset: {id}",{id});
      ws.send(JSON.stringify({ "type": "remove_player_headset", id }));
      // removePlayer(id);  // already did in WebSocketManagers
      toggleShowPopUpManageHeadset();
    } else {
      logger.error("Websocket not connected")
    }
  };

  const handleRestart = (id: string) => {
    logger.error(`Restart button clicked for headset ${id}`);
    // Logic for restart button
  };

  // Method launch button hide , at the bottom of this component 
  const handleGetPlayers = () => {
    if (ws !== null) {
      logger.info('Player list:', playerList);
    } else {
      logger.error('WebSocket is not connected');
    }
  };

  {

    return (
      <>


        {showPopUpManageHeadset ?



          <div className="fixed inset-0 flex items-center justify-center bg-slate-800 bg-opacity-75 z-10" onClick={toggleShowPopUpManageHeadset}  >

            <div className="rounded-md shadow-lg w-72 text-center z-20" onClick={(e) => e.stopPropagation()}  > {/*this prevent event bubbling, so that clicking the child div does not close the popup window*/}
              <div className="p-3 flex items-top bg-slate-300 rounded-t-md justify-between">
                <h2 className="text-lg font-semibold"  >
                  {Playerkey}:  {/* //TODO ajouter les traduction ici  */}
                </h2>
                <img src={cross} alt="X" className={`w-8 h-8 rounded-full cursor-pointer mix-blend-difference hover:bg-gray-800 ${className}`} onClick={toggleShowPopUpManageHeadset} />
              </div>

              <div className='bg-slate-200 p-2 text-left'>
                <p>Player: {String(playerId)}</p>
                <p>{t('Status')} : {String(selectedPlayer.connected)}</p>
                <p>{t('Hour of connection')} : {selectedPlayer.date_connection}</p>
                <p>{t('In game')} : {String(selectedPlayer.in_game)}</p>
              </div>
              {/* //*   */}
              <div className="bg-red-300 pb-3 rounded-b-md">
                <button
                  className="bg-red-500 text-white px-4 py-2 mt-4 rounded-l-md rounded-r-none"
                  onClick={() => handleRemove(Playerkey)}  >

                  {t('remove')}
                </button>
                {/* bouton vers le mirror d ece casque spécifiquement */}
                <button
                  className="bg-orange-500 text-white px-4 py-2 mt-4 rounded-r-md rounded-l-none"
                  onClick={() => handleRestart(Playerkey)}  >

                  {t('relaunch')}
                </button>


              </div>
            </div>
          </div>
          : null}

        <div className='flex flex-col bg-slate-200 shadow-sm rounded-xl hover:scale-105 items-center' onClick={toggleShowPopUpManageHeadset}>
          <div className='bg-slate-400 w-full rounded-t-xl cursor-pointer'  >
            <p> {Playerkey} </p></div>
          <VRHeadset
            key={Playerkey}
            selectedPlayer={selectedPlayer}
            playerId={Playerkey} />

          <div className={`rounded-b-xl justify-center w-full ${selectedPlayer.connected ? 'bg-green-500' : 'bg-red-500'}`}>
            {selectedPlayer.connected ?
              selectedPlayer.in_game ? <p>{t("in_game")}</p> :
                <p>{t("connected")}</p> : <p>{t("error")}</p>}
          </div>
        </div>


      </>

    );



  }
}



export default SimulationManagerPlayer