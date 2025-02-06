import VRHeadset from "../VRHeadset/VRHeadset";
import { useTranslation } from "react-i18next";
import Footer from "../Footer/Footer";
import Button from "../Button/Button";
import { useState } from 'react';
import { useWebSocket } from '../WebSocketManager/WebSocketManager';
import trashbin from '/src/svg_images/trashbin.svg';
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
          <div className="fixed inset-0 bg-gray-800 bg-opacity-75 z-50">
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
              icon={<svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="18" height="18" viewBox="0 0 48 48"  >
                <path fill="#FFFFFF" d="M 24 4 C 20.491685 4 17.570396 6.6214322 17.080078 10 L 10.238281 10 A 1.50015 1.50015 0 0 0 9.9804688 9.9785156 A 1.50015 1.50015 0 0 0 9.7578125 10 L 6.5 10 A 1.50015 1.50015 0 1 0 6.5 13 L 8.6386719 13 L 11.15625 39.029297 C 11.427329 41.835926 13.811782 44 16.630859 44 L 31.367188 44 C 34.186411 44 36.570826 41.836168 36.841797 39.029297 L 39.361328 13 L 41.5 13 A 1.50015 1.50015 0 1 0 41.5 10 L 38.244141 10 A 1.50015 1.50015 0 0 0 37.763672 10 L 30.919922 10 C 30.429604 6.6214322 27.508315 4 24 4 z M 24 7 C 25.879156 7 27.420767 8.2681608 27.861328 10 L 20.138672 10 C 20.579233 8.2681608 22.120844 7 24 7 z M 11.650391 13 L 36.347656 13 L 33.855469 38.740234 C 33.730439 40.035363 32.667963 41 31.367188 41 L 16.630859 41 C 15.331937 41 14.267499 40.033606 14.142578 38.740234 L 11.650391 13 z M 20.476562 17.978516 A 1.50015 1.50015 0 0 0 19 19.5 L 19 34.5 A 1.50015 1.50015 0 1 0 22 34.5 L 22 19.5 A 1.50015 1.50015 0 0 0 20.476562 17.978516 z M 27.476562 17.978516 A 1.50015 1.50015 0 0 0 26 19.5 L 26 34.5 A 1.50015 1.50015 0 1 0 29 34.5 L 29 19.5 A 1.50015 1.50015 0 0 0 27.476562 17.978516 z"  ></path>
                </svg>}
              onClick={togglePopUpshowPopUpManageHeadset}
            />


          </div>

  
        </>

      );
66
     
    
  
}
}



export default SimulationManagerPlayer