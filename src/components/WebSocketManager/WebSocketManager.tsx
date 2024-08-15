import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface Player {
    connected: boolean;
    date_connection: string;
    in_game: boolean;
}

interface PlayerList {
    [key: string]: Player;
}

// Define types for the WebSocket context
interface WebSocketContextType {
    ws: WebSocket | null;
    gama: {
        connected: boolean;
        loading: 'hidden' | 'visible';
        experiment_state: string;
        experiment_name: string;
        content_error: string
    };
    playerList: PlayerList;
}

// Initialize context with a default value of `null` for WebSocket and default values for other states
const WebSocketContext = createContext<WebSocketContextType | null>(null);

interface WebSocketManagerProps {
    children: ReactNode;
}

// The webSocketManager component
const WebSocketManager: React.FC<WebSocketManagerProps> = ({ children }) => {
    
    // Initialize states for WebSocket, gama and playerList
    const [ws, setWs] = useState<WebSocket | null>(null);
    const [gama, setGama] = useState({
        connected: false,
        loading: 'hidden' as 'hidden' | 'visible',
        experiment_state: 'NONE'
    });
    const [playerList, setPlayerList] = useState<PlayerList>({});

    // useEffect hook to connect to the WebSocket server
    useEffect(() => {
        const host = import.meta.env.WEB_APPLICATION_HOST || 'localhost';
        const port = import.meta.env.MONITOR_WS_PORT || '8001';

        const socket = new WebSocket(`ws://${host}:${port}`);
        setWs(socket);

        // event handle for the WebSocket connection
        socket.onopen = () => {
            console.log('[WebSocketManager] WebSocket connected to backend');
        };

        // event handler for messages received from the server
        socket.onmessage = (event: MessageEvent) => {
            
            // convert the data received to JSON
            const data = JSON.parse(event.data);
            console.log('[WebSocketManager] Data received:', data); // Log data received
            switch (data.type) {
                
                case 'json_state':
                    console.log('data retrieved ', data);
                    setGama(data.gama);
                    setPlayerList(data.player);
                    break;
                case 'json_settings':
                    console.log("json_settings data:",data);
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

    // Return the WebSocket context provider with the WebSocket, gama and playerList states for all its children
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
