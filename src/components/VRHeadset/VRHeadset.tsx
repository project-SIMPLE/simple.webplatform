
import { HEADSET_COLOR } from "../../api/core/Constants.ts";
 
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
            return ` /images/Headset/Headset_orange.png`;
        } else {
            const ipIdentifier: string = playerId!.split("_")[1];
            if (ipIdentifier in HEADSET_COLOR) {
                return ` /images/Headset/Headset_${HEADSET_COLOR[ipIdentifier]}.png`;
            } else {
                return ` /images/Headset/Headset_orange.png`;
            }
        }
    };


  return (
    <>
      <div
        className={`flex flex-col items-center relative ${className} ${isAvailable ? 'grayscale-0' : 'opacity-80 cursor-not-allowed size-52'}`}
        style={{ transition: 'all 0.3s ease', cursor: isAvailable ? 'pointer' : 'not-allowed' }}
      >
        <img 
          src={getHeadsetColor()}
          alt="VR Headset"
           className={`size-48`}

        />


    </div>
    </>
  );
};

export default VRHeadset; 
