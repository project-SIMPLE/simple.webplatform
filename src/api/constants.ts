/*
    INTERFACES  ========================================
 */

import {WebSocket} from "ws";

export interface JsonSettings {
    // Define the structure of your JSON settings here
}

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


export interface PlayerSocket extends WebSocket {
    isAlive: boolean;
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