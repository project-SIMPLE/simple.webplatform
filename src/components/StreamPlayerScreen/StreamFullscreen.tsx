import { useSearchParams } from "react-router-dom";
import { HEADSET_COLOR_CLASS } from "../../common/constants";
import VideoStreamManager from "../WebSocketManager/VideoStreamManager";

const StreamFullscreen = () => {
	const [searchParams] = useSearchParams();
	const idParam = searchParams.get("id") ?? "";
	const cleanId = idParam.replace(/\D/g, "");
	const bgColor = HEADSET_COLOR_CLASS[cleanId] ?? "bg-gray-900";
	//removes all non numerical values in the string, be careful when using this

	return (
		<div className={`w-full h-full flex flew-row items-center justify-center ${bgColor}`}>
			<VideoStreamManager selectedCanvas={cleanId} hideInfos={true} />
		</div>
	);
};

export default StreamFullscreen;
