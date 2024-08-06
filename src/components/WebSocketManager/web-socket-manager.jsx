import React, { createContext, useContext, useEffect, useState } from 'react';

// WebSocket context
const WebSocketContext = createContext(null);

const WebSocketManager = ({ children }) => {
    const [ws, setWs] = useState(null);
    const [gama, setGama] = useState({"connected": false, "loading": "hidden", "experiment_state": 'NONE'});
    const [playerList, setPlayerList] = useState([]);

    useEffect(() => {
        const socket = new WebSocket('ws://localhost:8001');//new WebSocket('ws://' + import.meta.env.WEB_APPLICATION_HOST + ':' + import.meta.env.MONITOR_WS_PORT);
        setWs(socket);

        socket.onopen = () => {
            console.log('[WebSocketManager] WebSocket connected to backend');
        };

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'json_state') {
                console.log("Do something ", data);
            } else {
                console.log("Do something else... ", data);
            }
        };

        socket.onclose = () => {
            console.log('WebSocket disconnected');
        };

        return () => {
            if (socket) {
                socket.close();
            }
        };
    }, []);

    return (
        <WebSocketContext.Provider value={{ ws, gama, playerList }}>
            {children}
        </WebSocketContext.Provider>
    );
};

export const useWebSocket = () => useContext(WebSocketContext);

export default WebSocketManager;