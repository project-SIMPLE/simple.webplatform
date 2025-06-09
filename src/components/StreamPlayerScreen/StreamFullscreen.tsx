import PlayerScreenCanvas from "../WebSocketManager/PlayerScreenCanvas"
import { useSearchParams } from "react-router-dom"
import VideoStreamManager from "../WebSocketManager/VideoStreamManager";
const StreamFullscreen = () => {

    const [identifier, setIdentifier] = useSearchParams();
    identifier.get("")

    const cleanId = identifier.toString().replace(/\D/g, "");
    //removes all non numerical values in the string, be careful when using this

    return (
        <div className="w-full flex flew-row items-center justify-center">
            <VideoStreamManager selectedCanvas={cleanId} hideInfos={true} />
        </div>
    )


}

export default StreamFullscreen