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
    minimal_players:string
}

// interface SimulationList {
//     [key: string]: Simulation;
// }

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
    // screenMode: string;

    removePlayer: (id: string) => void; // Define removePlayer here
    // setscreenMode: React.Dispatch<React.SetStateAction<string>>; 
    

    // screenMode: string;
    // setscreenMode: (mode: string) => void; 
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

    // const [screenMode, setscreenMode] = useState<string>("shared_screen");

    // Function to remove a player from the playerList
    const removePlayer = (id: string) => {
        setPlayerList(prevPlayerList => {
            const updatedPlayerList = { ...prevPlayerList };
            delete updatedPlayerList[id]; // Remove the player with the given id
            // console.log("Before updating: ", prevPlayerList);
            // console.log("After updating: ", updatedPlayerList);
            return updatedPlayerList;
        });
        // console.log(" This player have been removed from playerList : ", id);
    };


    // This useEffect will log the updated screenMode value
    // useEffect(() => {
    //     console.log("The screenMode has changed to :", screenMode);
    // }, [screenMode]);


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
                // console.log("Just the list of players :", playerList); // should show list of players 
                switch (data.type) {
                    // this case is launch too much time
                    case 'json_state':
                        setGama(data.gama);
                        // console.log('Liste des playeyrs', data.player);
                        setPlayerList(data.player);
                        break;


                    case 'json_settings':
                        break;
                    case 'get_simulation_by_index':
                        setSelectedSimulation(data.simulation);
                        break;
                    case 'remove_player_headset':
                        // console.log("playerList Before remove", playerList); // should show list of players 
                        removePlayer(data.id);
                        // console.log(` Player ${data.id} removed and in_game set to false.`);
                        // console.log("playerList after remove", playerList);
                        break;
                    

                    case 'setMonitorScreen': 
                        
                        // Asynchronus ! so doesnt immediately change the value of screenMode, cant have it after next lines 
                        // setscreenMode(data.mode);

                        // the setScreenMode doesnt change the value immediately, so we need to wait for it to change
                        // the setScreenMode doesnt works  
                        
                        break;
                    
                    default:
                        console.warn('[WebSocketManager] Message not processed', data);
                }
            }
        };

        // console.log("screenMode", screenMode);

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
    
    // methode that we will call from simulationManagerButtons.tsx
    // export const setScreenMode = (mode: string) => {
    //     setscreenMode(mode);
    //     console.log("Screen Mode updated :", mode);
    // };

    
    
        return (
        <WebSocketContext.Provider value={{ ws, isWsConnected, gama, playerList, simulationList, selectedSimulation,removePlayer }}>
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
