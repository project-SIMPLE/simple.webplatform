/*
    INTERFACES  ========================================
 */

import uWS from "uWebSockets.js";

// JSON WS ==============================================
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

export interface JsonPlayerAsk {
    type: string;
    action: string;
    args: string;   // JsonConvert.SerializeObject(Dictionary<string, string>)
    agent: string;
}

export interface JsonPlayer {
    id: string;
    type: string;
    expr?: string;
    heartbeat?: number;
}

// Internal message exchange ==============================================

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

export const HEADSET_COLOR: Record<string,string> = {
    "101": "blue",
    "102": "bg-red-300",
    "103": "bg-green-300",
    "104": "red",
    "105": "black",
    "106": "white",
    "110":"bg-green-400",
    "190": "red",
    "21": "blue",
    "15":"bg-blue-300"
};