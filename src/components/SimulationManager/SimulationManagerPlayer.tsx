import VRHeadset from "../VRHeadset/VRHeadset";
import { useTranslation } from "react-i18next";
import Footer from "../Footer/Footer";
import Button from "../Button/Button";
import { useState } from 'react';
import { useWebSocket } from '../WebSocketManager/WebSocketManager';
import trashbin from '/src/svg_logos/trashbin.svg';
interface PlayerProps {
  Playerkey: string
  selectedPlayer?: any;
  className?: string;
  playerId?: string;

}

const SimulationManagerPlayer = ({ Playerkey, selectedPlayer, className, playerId }: PlayerProps) => {
  const { t } = useTranslation();

  const { ws, gama, playerList, selectedSimulation } = useWebSocket(); // `removePlayer` is now available


  const [showPopUpManageHeadset, setshowPopUpManageHeadset] = useState(false);

  const toggleShowPopUpManageHeadset = () => {
    setshowPopUpManageHeadset(!showPopUpManageHeadset);
  };

  const handleRemove = (id: string) => {
    if (ws !== null) {
      console.log(`ID headset ${id}`);
      ws.send(JSON.stringify({ "type": "remove_player_headset", id }));
      // removePlayer(id);  // already did in WebSocketManagers
      toggleShowPopUpManageHeadset();
    } else {
      console.error('WebSocket is not connected');
    }
  };

  const handleRestart = (id: string) => {
    console.log(`Restart button clicked for headset ${id}`);
    // Logic for restart button
  };

  // Method launch button hide , at the bottom of this component 
  const handleGetPlayers = () => {
    if (ws !== null) {
      console.log('Player list:', playerList);
    } else {
      console.error('WebSocket is not connected');
    }
  };

  {

    return (
      <>


        {showPopUpManageHeadset ?

          <div className="fixed inset-0 bg-gray-800 bg-opacity-75 z-50">

            <div className="fixed inset-0 flex items-center justify-center z-50" onClick={toggleShowPopUpManageHeadset}  >

              <div className="bg-white p-6 rounded-lg shadow-lg w-72 text-center"  >

                <h2 className="text-lg font-semibold mb-4"  >

                  {t('popup_question')} {Playerkey} ?
                </h2>

                <div className='flex gap-5 ml-3'  >

                  <button
                    className="bg-red-500 text-white px-4 py-2 mt-4 rounded"
                    onClick={() => handleRemove(Playerkey)}  >

                    {t('remove')}
                  </button>

                  <button
                    className="bg-orange-500 text-white px-4 py-2 mt-4 rounded"
                    onClick={() => handleRestart(Playerkey)}  >

                    {t('relaunch')}
                  </button>

                </div>



                <button
                  className="bg-red-500 text-white px-4 py-2 mt-6 rounded"
                  onClick={toggleShowPopUpManageHeadset}>

                  {t('cancel')}
                </button>
              </div>
            </div>
          </div> : null}

        <div className='flex flex-col bg-slate-200 shadow-sm rounded-xl hover:scale-105 items-center' onClick={toggleShowPopUpManageHeadset}>
          <div className='bg-slate-400 w-full rounded-t-xl cursor-pointer'  >
            <p> {Playerkey} </p></div>
          <VRHeadset
            key={Playerkey}
            selectedPlayer={selectedPlayer}
            playerId={Playerkey} />
          {/* <Button
              bgColor='bg-red-500'
              icon={<img src={trashbin}/>}
              onClick={toggleShowPopUpManageHeadset}/> */}


          {/*//TODO add translation for connection status */}
          <div className={`rounded-b-xl justify-center w-full ${selectedPlayer.connected ? 'bg-green-500' : 'bg-red-500'}`}>
            {selectedPlayer.connected ?
              selectedPlayer.in_game ? <p>en jeu</p> :
                <p>connecté</p> : <p>erreur</p>}
          </div>
        </div>


      </>

    );
    66



  }
}



export default SimulationManagerPlayer