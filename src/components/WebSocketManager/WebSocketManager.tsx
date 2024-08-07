import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface Player {
    connected: boolean;
    date_connection: string;
    in_game: boolean
}

// Define types for the WebSocket context
interface WebSocketContextType {
    ws: WebSocket | null;
    gama: {
        connected: boolean;
        loading: 'hidden' | 'visible';
        experiment_state: string;
    };
    playerList: Player[];
}

// Initialize context with a default value of `null` for WebSocket and default values for other states
const WebSocketContext = createContext<WebSocketContextType | null>(null);

interface WebSocketManagerProps {
    children: ReactNode;
}

const WebSocketManager: React.FC<WebSocketManagerProps> = ({ children }) => {
    const [ws, setWs] = useState<WebSocket | null>(null);
    const [gama, setGama] = useState({
        connected: false,
        loading: 'hidden' as 'hidden' | 'visible',
        experiment_state: 'NONE'
    });
    const [playerList, setPlayerList] = useState<any[]>([]); // Replace `any` with a more specific type if available

    useEffect(() => {
        const host = import.meta.env.WEB_APPLICATION_HOST || 'localhost';
        const port = import.meta.env.MONITOR_WS_PORT || '8001';

        const socket = new WebSocket(`ws://${host}:${port}`);
        setWs(socket);

        socket.onopen = () => {
            console.log('[WebSocketManager] WebSocket connected to backend');
        };

        socket.onmessage = (event: MessageEvent) => {
            const data = JSON.parse(event.data);
            switch (data.type) {
                case 'json_state':
                    console.log('Do something', data);
                    setGama(data.gama);
                    setPlayerList(data.player);
                    break;
                case '':
                    console.log("toto");
                    break;
                default:
                    console.warn('[WebSocketManager] Message not processed', data);
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

export const useWebSocket = () => {
    const context = useContext(WebSocketContext);
    if (!context) {
        throw new Error('useWebSocket must be used within a WebSocketManager');
    }
    return context;
};

export default WebSocketManager;
