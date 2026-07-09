import { getLogger } from "@logtape/logtape";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import type {
	GamaState,
	PlayerList,
	VU_CATALOG_SETTING_JSON,
	VU_MODEL_SETTING_JSON,
	WsGetSimulationByIndex,
	WsJsonState,
	WsScreenControl,
} from "../../common/types";

const logger = getLogger(["components", "WebSocketManager"]);

// Define types for the WebSocket context
interface WebSocketContextType {
	ws: WebSocket | null;
	isWsConnected: boolean;
	gamaless: boolean;
	gama: GamaState;
	playerList: PlayerList;
	simulationList: (VU_CATALOG_SETTING_JSON | VU_MODEL_SETTING_JSON)[];
	selectedSimulation: VU_MODEL_SETTING_JSON | null;
	removePlayer: (id: string) => void;
}

// Initialize context with a default value of `null` for WebSocket and default values for other states
const WebSocketContext = createContext<WebSocketContextType | null>(null);

interface WebSocketManagerProps {
	children: ReactNode;
}

const WebSocketManager = ({ children }: WebSocketManagerProps) => {
	const [ws, setWs] = useState<WebSocket | null>(null);
	const [isWsConnected, setIsWsConnected] = useState<boolean>(false);
	const [gamaless, setGamaless] = useState<boolean>(false);
	const [gama, setGama] = useState<GamaState>({
		connected: false,
		loading: false,
		experiment_state: "NONE",
		experiment_id: "",
		experiment_name: "",
		content_error: "",
	});
	const [playerList, setPlayerList] = useState<PlayerList>({});
	const [simulationList, setSimulationList] = useState<(VU_CATALOG_SETTING_JSON | VU_MODEL_SETTING_JSON)[]>([]);
	const [selectedSimulation, setSelectedSimulation] = useState<VU_MODEL_SETTING_JSON | null>(null);

	// Function to remove a player from the playerList
	const removePlayer = (id: string) => {
		setPlayerList((prevPlayerList) => {
			const updatedPlayerList = { ...prevPlayerList };
			delete updatedPlayerList[id]; // Remove the player with the given id

			return updatedPlayerList;
		});
		logger.info(" This player have been removed from playerList : ", { id });
	};

	useEffect(() => {
		const host = window.location.hostname;
		const port = process.env.MONITOR_WS_PORT || "8001";
		const url = `ws://${host}:${port}`;

		let socket: WebSocket | null = null;
		let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
		let connectTimeout: ReturnType<typeof setTimeout> | null = null;
		// Set on unmount so pending timers don't reconnect a dead component.
		let disposed = false;

		const scheduleReconnect = () => {
			if (disposed || reconnectTimer) return;
			reconnectTimer = setTimeout(() => {
				reconnectTimer = null;
				logger.info("Reconnecting to backend...");
				connect();
			}, 1000);
		};

		const handleMessage = (event: MessageEvent) => {
			let data:
				| WsJsonState
				| WsGetSimulationByIndex
				| WsScreenControl
				| VU_CATALOG_SETTING_JSON
				| VU_MODEL_SETTING_JSON
				| (VU_CATALOG_SETTING_JSON | VU_MODEL_SETTING_JSON)[];
			logger.trace(`Message received, { event }`, { event });
			try {
				data = JSON.parse(event.data);
				// The backend double-encodes the simulation list: it sends a JSON string
				// whose value is itself a JSON array. Parse a second time in that case.
				if (typeof data === "string") {
					data = JSON.parse(data);
				}
			} catch (e) {
				logger.error("Failed to parse incoming message: {error}", { error: e });
				return;
			}

			// The backend sends the simulation list as a plain array of json_settings/catalog
			// objects with no wrapping type field — handle it before the switch.
			if (Array.isArray(data)) {
				setSimulationList(data);
				logger.debug("Simulation list updated, {count} entries", { count: data.length });
				return;
			}

			switch (data.type) {
				// this case is launched too often
				case "json_state": {
					const isGamaless = Object.keys(data.gama).length === 0;
					setGamaless(isGamaless);
					if (!isGamaless) {
						setGama(data.gama);
					}
					setPlayerList(data.player);
					break;
				}
				// Sets the selected simulation for the websocketManager's context
				case "get_simulation_by_index":
					setSelectedSimulation(data.simulation);
					break;
				case "screen_control":
					//TODO voir si on a toujours besoin de ça ?
					break;
				case "json_settings":
					// Single simulation metadata — should not replace the list
					logger.debug("Single json_settings received, ignoring for simulationList");
					break;
				default:
					logger.warn("Message not processed. data:{data}", { data });
			}
		};

		const connect = () => {
			if (disposed) return;
			socket = new WebSocket(url);
			setWs(socket);

			// The backend binds port 8001 early but can block the event loop during startup
			// (adb probe, synchronous model-file scan), leaving the WS upgrade pending for
			// seconds. If we're still CONNECTING after 3s, abort and retry — the retry
			// usually lands once startup's blocking work is done.
			connectTimeout = setTimeout(() => {
				if (socket && socket.readyState === WebSocket.CONNECTING) {
					logger.warn("WebSocket still connecting after 3s, retrying...");
					socket.close(); // triggers onclose → scheduleReconnect
				}
			}, 3000);

			socket.onopen = () => {
				if (connectTimeout) clearTimeout(connectTimeout);
				logger.info("WebSocket connected to backend");
				setIsWsConnected(true);
			};

			socket.onclose = () => {
				if (connectTimeout) clearTimeout(connectTimeout);
				logger.info("WebSocket disconnected");
				setIsWsConnected(false);
				scheduleReconnect();
			};

			// onerror is always followed by onclose; let onclose own the reconnect.
			socket.onerror = () => {};

			socket.onmessage = handleMessage;
		};

		connect();

		return () => {
			disposed = true;
			if (reconnectTimer) clearTimeout(reconnectTimer);
			if (connectTimeout) clearTimeout(connectTimeout);
			socket?.close();
		};
	}, []);

	return (
		<WebSocketContext.Provider
			value={{ ws, isWsConnected, gamaless, gama, playerList, simulationList, selectedSimulation, removePlayer }}
		>
			{children}
		</WebSocketContext.Provider>
	);
};

export const useWebSocket = () => {
	const context = useContext(WebSocketContext);
	if (!context) {
		throw new Error("useWebSocket must be used within a WebSocketManager");
	}
	return context;
};

export default WebSocketManager;
