import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface Player {
    connected: boolean;
    date_connection: string;
    in_game: boolean;
}

interface PlayerList {
    [key: string]: Player;
}

interface Simulation {
    experiment_name: string;
    model_file_path: string;
    name: string;
    player_html_file: string;
    player_web_interface: string;
    splashscreen: string;
    type: string;
    type_model_file_path: string;
}

interface SimulationList {
    [key: string]: Simulation;
}

// Define types for the WebSocket context
interface WebSocketContextType {
    ws: WebSocket | null;
    isWsConnected: boolean;
    gama: {
        connected: boolean;
        loading: 'hidden' | 'visible';
        experiment_state: string;
        experiment_name: string;
        content_error: string;
    };
    playerList: PlayerList;
    simulationList: Simulation[];
    selectedSimulation: Simulation | null;
}

// Initialize context with a default value of `null` for WebSocket and default values for other states
const WebSocketContext = createContext<WebSocketContextType | null>(null);

interface WebSocketManagerProps {
    children: ReactNode;
}

const WebSocketManager: React.FC<WebSocketManagerProps> = ({ children }) => {
    const [ws, setWs] = useState<WebSocket | null>(null);
    const [isWsConnected, setIsWsConnected] = useState<boolean>(false);
    const [gama, setGama] = useState({
        connected: false,
        loading: 'hidden' as 'hidden' | 'visible',
        experiment_state: 'NONE',
    });
    const [playerList, setPlayerList] = useState<PlayerList>({});
    const [simulationList, setSimulationList] = useState<Simulation[]>([]);
    const [selectedSimulation, setSelectedSimulation] = useState<Simulation | null>(null);

    useEffect(() => {
        const host = window.location.hostname; // getCurrentPageDomain(); -> "10.0.153.184";
        const port = import.meta.env.VITE_MONITOR_WS_PORT || '8001';

        const socket = new WebSocket(`ws://${host}:${port}`);
        setWs(socket);

        socket.onopen = () => {
            console.log('[WebSocketManager] WebSocket connected to backend');
            setIsWsConnected(true);
        };

        socket.onmessage = (event: MessageEvent) => {
            const data = JSON.parse(event.data);
            // console.log('[WebSocketManager] Data received:', data);

            if (Array.isArray(data) && data.every(d => d.type === 'json_simulation_list')) {
                setSimulationList(data.map(sim => sim.jsonSettings));
                console.log('[WebSocketManager] Simulation list:', data);
            } else {
                switch (data.type) {
                    case 'json_state':
                        setGama(data.gama);
                        setPlayerList(data.player);
                        break;
                    case 'json_settings':
                        // console.log('json_settings data:', data);
                        break;
                    case 'get_simulation_by_index':
                        // console.log('get_simulation_by_index data:', data);
                        setSelectedSimulation(data.simulation);
                        break;
                    default:
                        console.warn('[WebSocketManager] Message not processed', data);
                }
            }
        };

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

    return (
        <WebSocketContext.Provider value={{ ws, isWsConnected, gama, playerList, simulationList, selectedSimulation }}>
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
