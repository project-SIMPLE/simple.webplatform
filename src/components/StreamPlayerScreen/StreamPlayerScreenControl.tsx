import Header from '../Header/Header';
import { useState, useEffect } from 'react';
import Button from '../Button/Button';
import VideoStreamManager from '../WebSocketManager/VideoStreamManager';
const StreamPlayerScreenControl = () => {

    const [screenModeDisplay, setScreenModeDisplay] = useState("gama_screen");
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




    const emitDisplay = (displayType: string) => {
        let payload = { "type": 'screen_control', display_type: displayType };
        console.log(`emitted message:${JSON.stringify(payload)}`);
        socket.send((JSON.stringify(payload)));

    }







    return (
        <div className='flex flex-col h-[100dvh] w-[100dvw]'>
            <Header needsMiniNav />
            <div className='grow flex flex-col items-center justify-center'>
                <div className='grow rounded-md flex flex-col justify-center m-8 bg-[#a1d2ff]'>
                    {/*//? the weird values used here are to ensure that the blue container takes up the full screen, an sets the size as full screen minus the margin (m-8) 
                       //? if we simply used w-full, the margin would push the size beyond the border, and visually the margin would not be applied */}
                    <VideoStreamManager needsInteractivity={true} />
                </div>
                {/* <div className='flex flex-col'> //TODO ensure functionnality of these buttons affect the display, not necessary for now as it would require the gama stream to be working
                    <h2>tv display mode</h2>

                    <Button
                        onClick={() => emitDisplay("gama_screen")}
                        bgColor={"bg-white"}
                        showText={true}
                        className={`border-0 hover:border-none hover:bg-white focus:outline-none ${screenModeDisplay === "gama_screen" ? "" : "opacity-50"}`} // No border or color change on hover
                        icon={<img src="/images/gama_screen.png" alt="Monitoring" className='size-32' />}
                    />
                    <Button
                        onClick={() => emitDisplay("shared_screen")}
                        bgColor={"bg-white"}
                        showText={true}
                        className={`border-0 hover:border-none hover:bg-white focus:outline-none ${screenModeDisplay === "shared_screen" ? "" : "opacity-50"}`}
                        icon={<img src="/images/shared_screen.png" alt="shared_screen" className='size-32' />}
                    />




                </div> */}
            </div>
        </div>
    );
};

export default StreamPlayerScreenControl;