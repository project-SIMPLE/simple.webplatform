import VideoStreamManager from "../WebSocketManager/VideoStreamManager";

const StreamPlayerScreen = () => {
	return (
		<div className="w-full h-full flex flex-col items-center justify-around">
			<div className="w-full h-full flex flex-col items-center">
				<div className="flex justify-center items-center h-screen w-full">
					<VideoStreamManager />
					<div className="flex flex-col"></div>
				</div>
			</div>
		</div>
	);
};

export default StreamPlayerScreen;
