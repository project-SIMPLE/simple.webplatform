/**
 * Shared types used by both frontend and backend.
 * This file must NEVER import Node-only modules (uWebSockets.js, etc.)
 * so the frontend bundler can safely import from it.
 */

// ------------------------------------------------------------------
// Learning packages
// ------------------------------------------------------------------

/**
 * Interface to make manipulation of the json file easier.
 * These are incomplete and do not represent the full structure of the json file
 * but contain what is necessary to parse them.
 */
export interface VU_MODEL_SETTING_JSON {
	type: "json_settings";
	name: string;
	splashscreen: string;
	model_file_path: string;
	experiment_name: string;
	minimal_players: string;
	maximal_players: string;
	selected_monitoring?: "gama_screen";
}

export interface VU_CATALOG_SETTING_JSON {
	type: "catalog";
	name: string;
	splashscreen?: string;
	entries: VU_MODEL_SETTING_JSON[] | VU_CATALOG_SETTING_JSON[];
}

// ------------------------------------------------------------------
// Monitor-friendly simplifications (backend sends these to monitors)
// ------------------------------------------------------------------

export interface MIN_VU_MODEL_SETTING_JSON extends Pick<VU_MODEL_SETTING_JSON, "name" | "splashscreen"> {
	type: string;
	model_index: number;
}

export interface MIN_VU_CATALOG_SETTING_JSON extends Pick<VU_CATALOG_SETTING_JSON, "name" | "splashscreen"> {
	type: string;
	entries: MIN_VU_MODEL_SETTING_JSON[] | MIN_VU_CATALOG_SETTING_JSON;
}

// ------------------------------------------------------------------
// Internal state exchange
// ------------------------------------------------------------------

export interface PlayerState {
	connected: boolean;
	in_game: boolean;
	date_connection: string;
}

export interface GamaState {
	connected: boolean;
	experiment_state: string;
	loading: boolean;
	content_error: string;
	experiment_id: string;
	experiment_name: string;
	/** True when GAMA runs an experiment the platform didn't launch and cannot control (e.g. opened in GAMA's GUI) */
	foreign_experiment_detected?: boolean;
}

/** Record of players keyed by their identifier */
export interface PlayerList {
	[key: string]: PlayerState;
}

// ------------------------------------------------------------------
// WebSocket outgoing message types (monitor → backend)
// ------------------------------------------------------------------

export type WsMessageType =
	| "get_simulation_informations"
	| "try_connection"
	| "send_simulation"
	| "launch_experiment"
	| "resume_experiment"
	| "pause_experiment"
	| "stop_experiment"
	| "remove_player_headset";

export interface WsGetSimulationInformations {
	type: "get_simulation_informations";
}

export interface WsTryConnection {
	type: "try_connection";
}

export interface WsSendSimulation {
	type: "send_simulation";
	simulation: VU_MODEL_SETTING_JSON | VU_CATALOG_SETTING_JSON;
}

export interface WsLaunchExperiment {
	type: "launch_experiment";
}

export interface WsResumeExperiment {
	type: "resume_experiment";
}

export interface WsPauseExperiment {
	type: "pause_experiment";
}

export interface WsStopExperiment {
	type: "stop_experiment";
}

export interface WsRemovePlayerHeadset {
	type: "remove_player_headset";
	id: string;
}

export type WsMessage =
	| WsGetSimulationInformations
	| WsTryConnection
	| WsSendSimulation
	| WsLaunchExperiment
	| WsResumeExperiment
	| WsPauseExperiment
	| WsStopExperiment
	| WsRemovePlayerHeadset;

// ------------------------------------------------------------------
// WebSocket incoming message types (backend → monitor)
// ------------------------------------------------------------------

export interface WsJsonState {
	type: "json_state";
	gama: GamaState;
	player: PlayerList;
}

export interface WsGetSimulationByIndex {
	type: "get_simulation_by_index";
	simulation: VU_MODEL_SETTING_JSON;
}

export interface WsScreenControl {
	type: "screen_control";
	display_type?: string;
}

export interface WsStreamAvailable {
	type: "stream_available";
	streamId: string;
}

export interface WsStreamEnded {
	type: "stream_ended";
	streamId: string;
}

export interface WsStreamList {
	type: "stream_list";
	streamIds: string[];
}

export type WsIncomingMessage =
	| WsJsonState
	| WsGetSimulationByIndex
	| WsScreenControl
	| WsStreamAvailable
	| WsStreamEnded
	| WsStreamList;
