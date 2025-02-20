import { useEffect, useRef, useState } from "react";
import { useScreenModeState } from "../ScreenModeContext/ScreenModeContext";
import VideoStreamManager from "../WebSocketManager/VideoStreamManager";
import Button from "../Button/Button";
import socket  from "../../socket";
const StreamPlayerScreen = () => {
  const [screenModeDisplay, setScreenModeDisplay] = useState("gama_screen"); // Get the screen mode display from the context
  const videoContainerRef = useRef<HTMLDivElement>(null); // Add ref for the target div

  useEffect(() => {
    socket.on('message', (newState) => {
        console.log("received",newState);
        setScreenModeDisplay(newState);
    });
});

  // Rendu basé sur la valeur de screenModeDisplay
  return (
    <>
      <VideoStreamManager targetRef={videoContainerRef} />

      {screenModeDisplay === "shared_screen" && (
        <div className="flex flex-wrap justify-center items-center h-screen bg-slate-100" ref={videoContainerRef}>
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
