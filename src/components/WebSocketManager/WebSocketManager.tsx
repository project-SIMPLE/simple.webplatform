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
    maximal_players: string,
    minimal_players: string,
    selected_monitoring: string
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


    removePlayer: (id: string) => void; // Define removePlayer here

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
        experiment_name: '',
        content_error: '',
    });
    const [playerList, setPlayerList] = useState<PlayerList>({});
    const [simulationList, setSimulationList] = useState<Simulation[]>([]);
    const [selectedSimulation, setSelectedSimulation] = useState<Simulation | null>(null);


    // Function to remove a player from the playerList
    const removePlayer = (id: string) => {
        setPlayerList(prevPlayerList => {
            const updatedPlayerList = { ...prevPlayerList };
            delete updatedPlayerList[id]; // Remove the player with the given id

            return updatedPlayerList;
        });

    };


    useEffect(() => {
        const host = window.location.hostname;
        const port = import.meta.env.VITE_MONITOR_WS_PORT || '8001';

        const socket = new WebSocket(`ws://${host}:${port}`);
        setWs(socket);

        socket.onopen = () => {
            console.log('[WebSocketManager] WebSocket connected to backend');
            setIsWsConnected(true);
        };

        socket.onmessage = (event: MessageEvent) => {
            const data = JSON.parse(event.data);


            if (Array.isArray(data) && data.every(d => d.type === 'json_simulation_list')) {
                setSimulationList(data.map(sim => sim.jsonSettings));
                console.log('[WebSocketManager] Simulation list:', data);
            } else {
                switch (data.type) {
                    // this case is launch too much time
                    case 'json_state':
                        setGama(data.gama);
                        setPlayerList(data.player);
                        break;
                    case 'get_simulation_by_index':
                        setSelectedSimulation(data.simulation);
                        break;
                    case 'setMonitorScreen':



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
        <WebSocketContext.Provider value={{ ws, isWsConnected, gama, playerList, simulationList, selectedSimulation, removePlayer }}>
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
