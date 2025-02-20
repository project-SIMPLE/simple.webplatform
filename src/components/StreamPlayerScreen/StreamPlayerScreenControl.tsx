import Header from '../Header/Header';
import { useState, useEffect } from 'react';
import visibility_off from '../../svg_logos/visibility_off.svg';
import Button from '../Button/Button';
import {io} from "socket.io-client";
import socket  from "../../socket";
const StreamPlayerScreenControl = () => {
    const socket = io("10.2.172.36:3001");
    const placeholdercontrol2 = ` size-full bg-green-100 items-center justify-center flex flex-col`
    const placeholdercontrol = ` size-full items-center justify-center flex flex-col `
    const [screenModeDisplay, setScreenModeDisplay] = useState("gama_screen");
    const channel = new BroadcastChannel('simulation-to-stream'); //using the broadcast api to update display type in the streamPlayerScreen
    

    // const updateDisplay = (screenModeDisplay: string) => {
    //     setScreenModeDisplay(screenModeDisplay);
    //     localStorage.setItem("displayMode", screenModeDisplay);
    //     console.log("local storage set to", screenModeDisplay)
    // };
 
    // useEffect(() => { //TODO enlever si la méthode avec un websocket fonctionne
    //     channel.onmessage = (event) => {
    //         setScreenModeDisplay(event.data.screenModeDisplay);
    //         console.log(`recieved message from channel: ${event.data.screenModeDisplay}`);

    //     };
    //     return () => {
    //         console.log('closing channel');
    //         channel.close();
    //     };

    // }, []);

    //TODO code pas au bon endroit
    // socket.on("connect",() => {
    //     console.log("connected",socket.id);
    // })

    // socket.on("disconnect", () => {
    //     console.log(socket.id);
    // })

    const emitGama = () => {
        console.log("emitted gama_screen on message");
        socket.emit("message", "gama_screen");
    }
    
    const emitShared = () => {
        console.log("emitted shared on message");
        socket.emit("message", "shared_screen");
    }

    useEffect(() => {
        socket.on('message', (newState) => {
            console.log("received",newState);
            setScreenModeDisplay(newState);
        });
    });

    const updateDisplay = (screenModeDisplay: string) => {
        socket.emit("updateDisplay", {screenModeDisplay: screenModeDisplay});
        console.log("emitted",screenModeDisplay);
    }

    return (
        <div className='h-full flex flex-col'>
            <Header needsMiniNav />
            <h1 className='text-center'>Controls screen placeholder</h1>
            <div className='flex flex-row items-center justify-center h-full'>
                <div className='w-5/6 h-5/6 rounded-md place-items-center justify-center grid grid-rows-2 grid-cols-3' style={{ backgroundColor: '#a1d2ff' }}>
                    <div className={`${placeholdercontrol} `}> <img src={visibility_off} className='mix-blend-difference size-40' />  </div>
                    <div className={`${placeholdercontrol2} `}> <img src={visibility_off} className='mix-blend-difference size-40' />  </div>
                    <div className={`${placeholdercontrol} `}> <img src={visibility_off} className='mix-blend-difference size-40' />  </div>
                    <div className={`${placeholdercontrol2} `}> <img src={visibility_off} className='mix-blend-difference size-40' />  </div>
                    <div className={`${placeholdercontrol} `}> <img src={visibility_off} className='mix-blend-difference size-40' />  </div>
                    <div className={`${placeholdercontrol2} `}> <img src={visibility_off} className='mix-blend-difference size-40' />  </div>
                </div>
                <div className='flex flex-col'>
                    <h2>tv display mode</h2>

                    <Button
                        onClick={emitGama}
                        bgColor={"bg-white"}
                        showText={true}
                        className={`border-0 hover:border-none hover:bg-white focus:outline-none ${screenModeDisplay === "gama_screen" ? "" : "opacity-50"}`} // No border or color change on hover
                        icon={<img src="/images/gama_screen.png" alt="Monitoring" className='size-32' />}
                    />
                    <Button
                        onClick={emitShared}
                        bgColor={"bg-white"}
                        showText={true}
                        className={`border-0 hover:border-none hover:bg-white focus:outline-none ${screenModeDisplay === "shared_screen" ? "" : "opacity-50"}`}
                        icon={<img src="/images/shared_screen.png" alt="shared_screen" className='size-32' />}
                    />




                </div>
            </div>
        </div>
    );
};

export default StreamPlayerScreenControl;