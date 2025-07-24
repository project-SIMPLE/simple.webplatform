import PlayerScreenCanvas from "../WebSocketManager/PlayerScreenCanvas"
import { useSearchParams } from "react-router-dom"
import VideoStreamManager from "../WebSocketManager/VideoStreamManager";
import { HEADSET_COLOR } from "../../api/core/Constants.ts";
const StreamFullscreen = () => {
    const [identifier, setIdentifier] = useSearchParams();
    identifier.get("")
    const cleanId = identifier.toString().replace(/\D/g, "");
    const bgColor = HEADSET_COLOR[cleanId]
    //removes all non numerical values in the string, be careful when using this

    return (
        <div className= {`w-full h-full flex flew-row items-center justify-center ${bgColor}`}>
            <VideoStreamManager selectedCanvas={cleanId} hideInfos={true} />
        </div>
    )


}

export default StreamFullscreen