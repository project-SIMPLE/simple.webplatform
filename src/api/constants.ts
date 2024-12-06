/*
    INTERFACES  ========================================
 */

import uWS from "uWebSockets.js";

export interface JsonPlayer {
    // Define the structure of your JSON player here
}

export interface JsonOutput {
    contents?: Array<{
        id: string[];
        contents: any;
    }>;
}

export interface JsonSettings {
    model_file_path: string;
    experiment_name: string;
}

export interface JsonMonitor {
    type: string;
    id?: string;
    simulationIndex?: number;
}

export interface GamaState {
    connected: boolean;
    experiment_state: string;
    loading: boolean;
    content_error: string;
    experiment_id: string;
    experiment_name: string;
}

export interface PlayerJson {
    id: string;
    type: string;
    expr?: string;
    heartbeat?: number;
}

export interface PlayerState {
    connected: boolean;
    in_game: boolean;
    date_connection: string;
}

export interface Player {
    id: string,
    // Player Socket
    ws: uWS.WebSocket<unknown>,
    ping_interval: number,
    is_alive: boolean,
    timeout?: NodeJS.Timeout,
    // Player State
    connected: boolean,
    in_game: boolean,
    date_connection: string,
}

/*
    CONSTANTS   ========================================
 */
export const GAMA_ERROR_MESSAGES = [
    "SimulationStatusError",
    "SimulationErrorDialog",
    "SimulationError",
    "RuntimeError",
    "GamaServerError",
    "MalformedRequest",
    "UnableToExecuteRequest"
];

export const HEADSET_COLOR = {
    "101": "blue",
    "102": "red",
    "103": "green",
    "104": "yellow",
    "105": "black",
    "106": "white"
};