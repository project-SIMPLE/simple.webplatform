import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {HEADSET_COLOR} from "../../api/constants.ts";

interface VRHeadsetProps {
  selectedPlayer?: any;  
  className?: string;
  playerId?: string;
}

const VRHeadset: React.FC<VRHeadsetProps> = ({ selectedPlayer, className, playerId }) => {
  const [showPopUp, setShowPopUp] = useState(false);
  const {t} = useTranslation();

  // Determined if the player is available
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
        className={`flex flex-col items-center ${className} ${isAvailable && selectedPlayer.connected ? 'grayscale-0' : 'opacity-50 cursor-not-allowed'}`}
        style={{ transition: 'all 0.3s ease', cursor: isAvailable ? 'pointer' : 'not-allowed' }}
      >
        <img
          src={getHeadsetColor()}
          alt="VR Headset"
          className={`w-32 h-32 object-cover mb-2 ${isAvailable ? 'hover:scale-105' : ''}`} 
          onClick={() => {
            if (isAvailable) {
              togglePopUp(); 
            }
          }}
        />

      {/* Pop-up pour afficher les informations du joueur */}
      </div>
        
      {showPopUp && isAvailable && (
        <>
          {/* Grey Overley */}
          <div className="fixed inset-0 bg-gray-800 bg-opacity-75 z-50"></div>

          <div className="fixed inset-0 flex items-center justify-center z-50" onClick={togglePopUp}>
              <div className="bg-white p-6 rounded-lg shadow-lg w-72 text-center">
                  <h2 className="text-lg font-semibold mb-4">Player Informations</h2>
                  <p>Player: {String(playerId)}</p>
                  <p>{t('Status')} : {String(selectedPlayer.connected)}</p>
                  <p>{t('Hour of connection')} : {selectedPlayer.date_connection}</p>
                  <p>{t('In game')} : {String(selectedPlayer.in_game)}</p>

                  <button
                      className="bg-red-500 text-white px-4 py-2 mt-4 rounded"
                      onClick={togglePopUp}
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
