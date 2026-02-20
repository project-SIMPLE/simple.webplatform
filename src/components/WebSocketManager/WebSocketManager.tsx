import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Simulation } from "../../api/core/Constants.ts"
import { getLogger } from '@logtape/logtape';



const logger = getLogger(["components", "WebSocketManager"]);
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

const WebSocketManager = ({ children }: WebSocketManagerProps) => {
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
        logger.info(" This player have been removed from playerList : ", {id});
    };


    useEffect(() => {
        const host = window.location.hostname;
        const port = process.env.MONITOR_WS_PORT || '8001';

        const socket = new WebSocket(`ws://${host}:${port}`);
        setWs(socket);

        socket.onopen = () => {
            logger.info('[WebSocketManager] WebSocket connected to backend');
            setIsWsConnected(true);
        };

        socket.onmessage = (event: MessageEvent) => {
            logger.info(`[WebSocketManager] message received`)
            let data = JSON.parse(event.data);
            logger.debug(data.type)
            if (typeof data == "string") {
                try {
                    data = JSON.parse(data);
                } catch (e) {
                    logger.error("Can't JSON parse this received string: {data}", { data });
                }
            }

            if (Array.isArray(data) && data.every(d => d.type === 'json_simulation_list')) {
                setSimulationList(data.map(sim => sim.jsonSettings));
                logger.debug('[WebSocketManager] Simulation list: {data}',{data : data.toString()});
            } else {
                switch (data.type) {
                    // this case is launch too much time
                    case 'json_state':
                        setGama(data.gama);
                        setPlayerList(data.player);
                        break;
                    //Sets the selected simulation for the websocketManager's context
                    case 'get_simulation_by_index':
                        setSelectedSimulation(data.simulation);
                        break;
                    case 'screen_control':
                        //TODO voir si on a toujours besoin de ça ?
                        break;
                    default:
                        logger.warn('[WebSocketManager] Message not processed, defaulted to setSimulationList. data:{data}', { data });
                        setSimulationList(data)
                   
                }
            }
        };


        socket.onclose = () => {
            logger.info('[WebSocketManager] WebSocket disconnected');
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
