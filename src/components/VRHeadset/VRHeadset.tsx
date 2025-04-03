import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {HEADSET_COLOR} from "../../api/constants.ts";

interface VRHeadsetProps {
  selectedPlayer?: any;  
  className?: string;
  playerId?: string;
}

const VRHeadset= ({ selectedPlayer, className, playerId }: VRHeadsetProps) => {

  // Determines if the player is available 
  const isAvailable = !!selectedPlayer;

    const getHeadsetColor = () => {
        if (!isAvailable || playerId === undefined) {
            return "/images/headset_white.png";
        } else {
            const ipIdentifier: string = playerId!.split("_")[1];
            if (ipIdentifier in HEADSET_COLOR) {
                // @ts-ignore
                return `/images/headset_${HEADSET_COLOR[ipIdentifier].split('-'[1])}.png`;
            } else {
                return "/images/headset_white.png";
            }
        }
    };


  return (
    <>
      <div
        className={`flex flex-col items-center  ${className} ${isAvailable ? 'grayscale-0' : 'opacity-50 cursor-not-allowed'}`}
        style={{ transition: 'all 0.3s ease', cursor: isAvailable ? 'pointer' : 'not-allowed' }}
      >
        <img 
          src={getHeadsetColor()}
          alt="VR Headset"
           className={`w-32 h-32 object-cover border-black border- `}

        />


    </div>
    </>
  );
};

export default VRHeadset; 
