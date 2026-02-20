import { useRef } from "react";
import VideoStreamManager from "../WebSocketManager/VideoStreamManager";
import Header from "../Header/Header";
const StreamPlayerScreen = () => {


  const videoContainerRef = useRef<HTMLDivElement>(null); // Add ref for the target div


  return (
    <div className="w-full h-full flex flex-col items-center justify-around">

      <div className="w-full h-full flex flex-col items-center">
          <div className="flex justify-center items-center h-screen bg-[#a1d2ff]'" ref={videoContainerRef}>
            <Header needsMiniNav />
            <VideoStreamManager />
            <div className='flex flex-col'>

            </div>
          </div>


        

      </div>


    </div>
  );
};




export default StreamPlayerScreen;
