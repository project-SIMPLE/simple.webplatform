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
    type?: string;
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
    "101": "bg-blue-500",
    "102": "bg-green-300",
    "103": "bg-black-500",
    "104": "bg-red-300",
    "105": "bg-yellow-300",  
    "106": "bg-white",
    "110":"bg-green-300",
    "190": "red",
    "21": "bg-blue-500",
    "15":"bg-blue-600"
};

/**
 * ANSI colors for console output
 */
export const ANSI_COLORS: Record<string,string> ={
    "black": "\x1b[30m",
    "red": "\x1b[31m",
    "green": "\x1b[32m",
    "yellow": "\x1b[33m",
    "blue": "\x1b[34m",
    "magenta": "\x1b[35m",
    "cyan": "\x1b[36m",
    "white": "\x1b[37m",
    "orange": "\x1b[38;5;208m",
    "purple": "\x1b[38;5;129m",
    "reset": "\x1b[0m"
}