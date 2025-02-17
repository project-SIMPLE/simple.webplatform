import { useEffect, useRef, useState } from "react";
import { useScreenModeState } from "../ScreenModeContext/ScreenModeContext";
import VideoStreamManager from "../WebSocketManager/VideoStreamManager";
import Button from "../Button/Button";

const StreamPlayerScreen = () => {
  const [screenModeDisplay, setScreenModeDisplay] = useState("gama_screen"); // Get the screen mode display from the context
  const channel = new BroadcastChannel("simulation-to-stream"); // get the data from the simulation manager control panel
  const videoContainerRef = useRef<HTMLDivElement>(null); // Add ref for the target div


  useEffect(() => {
    channel.onmessage = (event) => {
      console.log("Message received in StreamPlayerScreen", event.data);
      setScreenModeDisplay(event.data.screenModeDisplay);
    };
  return() => {
    channel.close();};
  
  }, []);

  // Rendu basé sur la valeur de screenModeDisplay
  return (
    <>
      <VideoStreamManager targetRef={videoContainerRef} />

      {screenModeDisplay === "shared_screen" && (
          <div className="flex flex-wrap justify-center items-center h-screen bg-gray-100" ref={videoContainerRef}>
            shared screen

          </div>


      )}

      {screenModeDisplay === "gama_screen" && (
        <div className="bg-gray-400 relative w-full h-screen flex">
          gama screen
          {/* Your content for gama_screen */}
        </div>
      )}

      {screenModeDisplay !== "gama_screen" &&
        screenModeDisplay !== "shared_screen" && (
          
          <div className="bg-red-400 relative w-full h-screen flex items-center justify-center">
            <p>Unknown screen mode: {screenModeDisplay}</p>
          </div>
        )}

    </>
  );  
};




export default StreamPlayerScreen;
