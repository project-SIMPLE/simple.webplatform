import VRHeadset from "../VRHeadset/VRHeadset";
import { useTranslation } from "react-i18next";
import Footer from "../Footer/Footer";
import Button from "../Button/Button";
import { useState } from 'react';
import { useWebSocket } from '../WebSocketManager/WebSocketManager';
import trashbin from '/src/svg_logos/trashbin.svg';
interface PlayerProps {
  Playerkey: string
}

const SimulationManagerPlayer = ({ Playerkey }: PlayerProps) => {
  const { t } = useTranslation();

  const { ws, gama, playerList, selectedSimulation } = useWebSocket(); // `removePlayer` is now available


  const [showPopUpManageHeadset, setshowPopUpManageHeadset] = useState(false);
  
  const togglePopUpshowPopUpManageHeadset = () => {
    setshowPopUpManageHeadset(!showPopUpManageHeadset);
  };

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
          <div className="fixed inset-0 bg-gray-800 bg-opacity-75 z-10">
          <div className="fixed inset-0 flex items-center justify-center z-50" onClick={togglePopUpshowPopUpManageHeadset}  >
            
             <div className="bg-white p-6 rounded-lg shadow-lg w-72 text-center"  >
              <h2 className="text-lg font-semibold mb-4"  >
                
                {t('popop_question')} {Playerkey} ?
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
                onClick={togglePopUpshowPopUpManageHeadset}  >

                {t('cancel')}
              </button>
          </div>
          </div>
          </div>   : null}

          <div className='flex gap-3 mt-2'  >
            <p style={{ marginTop: '3px' }}  > {Playerkey} </p>
            <Button
              bgColor='bg-red-500'
              icon={<img src={trashbin}/>}
              onClick={togglePopUpshowPopUpManageHeadset}
            />


          </div>

  
        </>

      );
66
     
    
  
}
}



export default SimulationManagerPlayer