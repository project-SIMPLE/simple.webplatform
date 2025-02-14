import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {HEADSET_COLOR} from "../../api/constants.ts";

interface VRHeadsetProps {
  selectedPlayer?: any;  
  className?: string;
  playerId?: string;
}

const VRHeadset= ({ selectedPlayer, className, playerId }: VRHeadsetProps) => {
  const [showPopUp, setShowPopUp] = useState(false);
  const {t} = useTranslation();

  // Determines if the player is available 
  const isAvailable = !!selectedPlayer;

    const getHeadsetColor = () => {
        if (!isAvailable || playerId === undefined) {
            return "/images/headset_white.png";
        } else {
            const ipIdentifier: string = playerId!.split("_")[1];
            if (ipIdentifier in HEADSET_COLOR) {
                // @ts-ignore
                return `/images/headset_${HEADSET_COLOR[ipIdentifier]}.png`;
            } else {
                return "/images/headset_white.png";
            }
        }
    };

  const togglePopUp = () => {
    setShowPopUp(!showPopUp); 
  };

  return (
    <>
      <div
        className={`flex flex-col items-center ${className} ${isAvailable ? 'grayscale-0' : 'opacity-50 cursor-not-allowed'}`}
        style={{ transition: 'all 0.3s ease', cursor: isAvailable ? 'pointer' : 'not-allowed' }}
      >
        <img 
          src={getHeadsetColor()}
          alt="VR Headset"
           className={`w-32 h-32 object-cover mb-2 border-black border- `}

        />

      {/* Pop-up pour afficher les informations du joueur */}
      </div>
        
      {showPopUp && isAvailable && (
        <>

          <div className="fixed inset-0 flex items-center justify-center z-50 bg-slate-800 opacity-75">
              <div className="bg-white p-6 rounded-lg shadow-lg w-72 text-center">
                  <h2 className="text-lg font-semibold mb-4">Player Informations</h2>
                  <p>Player: {String(playerId)}</p>
                  <p>{t('Status')} : {String(selectedPlayer.connected)}</p>
                  <p>{t('Hour of connection')} : {selectedPlayer.date_connection}</p>
                  <p>{t('In game')} : {String(selectedPlayer.in_game)}</p>

                  <button
                      className="bg-red-500 text-white px-4 py-2 mt-4 rounded"
                  >
                      {t('cancel')}
                  </button>
              </div>
          </div>
        </>
      )}
    </>
  );
};

export default VRHeadset; 
