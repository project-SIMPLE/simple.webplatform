import { useEffect, useRef, useState } from "react";
import VideoStreamManager from "../WebSocketManager/VideoStreamManager";
import Header from "../Header/Header";
import gama from '/images/gama_example.png?url';
const StreamPlayerScreen = () => {
  const [screenModeDisplay, setScreenModeDisplay] = useState("gama_screen"); // Get the screen mode display from the context
  const videoContainerRef = useRef<HTMLDivElement>(null); // Add ref for the target div
  const placeholdercontrol2 = ` size-full bg-green-100 items-center justify-center flex flex-col`
  const placeholdercontrol = ` size-full items-center justify-center flex flex-col `
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isWsConnected, setIsWsConnected] = useState<boolean>(false);
  const host = window.location.hostname;
  const port = process.env.MONITOR_WS_PORT || '8001';
  const socket = new WebSocket(`ws://${host}:${port}`);


  useEffect(() => {

    setWs(socket);
    socket.onopen = () => {
      console.log('[TVControlSocket] WebSocket connected to backend');
      setIsWsConnected(true);
    };

    socket.onmessage = (event: MessageEvent) => {
      let data = JSON.parse(event.data);
      if (typeof data == "string") {
        try {
          data = JSON.parse(data);
        } catch (e) {
          console.error("Can't JSON parse this received string", data);
        }
      }

      if (data.type == 'screen_control') {
        console.log(data);
        setScreenModeDisplay(data.display_type);

      }
    }

    socket.onclose = () => {
      console.log('[WebSocketManager] WebSocket disconnected');
      setIsWsConnected(false);
    };

    return () => {
      if (socket) {
        socket.close();
      }
    };

  }, []);



  // Rendu basé sur la valeur de screenModeDisplay
  return (
    <div className="w-full h-full flex flex-col items-center justify-around">
      <Header hideTranslation />

      <div className="w-full h-full flex flex-col items-center">
        {screenModeDisplay === "shared_screen" && (
          <div className="flex justify-center items-center h-screen bg-[#a1d2ff]'" ref={videoContainerRef}>
            <Header needsMiniNav />

            <VideoStreamManager />
            <div className='flex flex-col'>
              {/* <div className={`${placeholdercontrol2} `}> <img src={gama} className=' border-2 border-black' />  </div> */}
            </div>
          </div>


        )}

        {screenModeDisplay === "gama_screen" && (
          <div className="relative h-5-6 w-5/6 flex grow bg-[#a1d2ff] m-4 rounded-md">
            <VideoStreamManager />
            {/* <div className="w-1/2 items-center justify-center flex bg-slate-100" ref={videoContainerRef}> <img src={gama} className="border-2 border-black" />    </div> */}
          </div>
        )}

        {screenModeDisplay !== "gama_screen" &&
          screenModeDisplay !== "shared_screen" && (

            <div className="bg-red-400 relative w-full h-screen flex items-center justify-center">
              <p>Unknown screen mode: {screenModeDisplay}</p>
            </div>
          )}
      </div>

    </div>
  );
};




export default StreamPlayerScreen;
