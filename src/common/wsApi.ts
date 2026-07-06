import { getLogger } from "@logtape/logtape";
import type { VU_CATALOG_SETTING_JSON, VU_MODEL_SETTING_JSON, WsMessage } from "./types";

const logger = getLogger(["services", "wsApi"]);

function send(ws: WebSocket | null, message: WsMessage): boolean {
	if (!ws) {
		logger.error("Tried to send WebSocket message but ws is null");
		return false;
	}
	ws.send(JSON.stringify(message));
	return true;
}

export const wsApi = {
	getSimulationInformations(ws: WebSocket | null) {
		return send(ws, { type: "get_simulation_informations" });
	},

	tryConnection(ws: WebSocket | null) {
		return send(ws, { type: "try_connection" });
	},

	sendSimulation(ws: WebSocket | null, simulation: VU_MODEL_SETTING_JSON | VU_CATALOG_SETTING_JSON) {
		return send(ws, { type: "send_simulation", simulation });
	},

	launchExperiment(ws: WebSocket | null) {
		return send(ws, { type: "launch_experiment" });
	},

	resumeExperiment(ws: WebSocket | null) {
		return send(ws, { type: "resume_experiment" });
	},

	pauseExperiment(ws: WebSocket | null) {
		return send(ws, { type: "pause_experiment" });
	},

	stopExperiment(ws: WebSocket | null) {
		return send(ws, { type: "stop_experiment" });
	},

	removePlayerHeadset(ws: WebSocket | null, id: string) {
		return send(ws, { type: "remove_player_headset", id });
	},
};
