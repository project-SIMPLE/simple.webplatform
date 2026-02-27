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

export interface SETTINGS_FILE_JSON {
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

// Learning packages ==============================================

/**
 * Inteface to make manipulation of the json file easier
 * these are incomplete and do not represent the full structure of the json file
 * but contain what is necessary to parse them
 */
export interface VU_MODEL_SETTING_JSON {
    type: "json_settings";
    name: string;
    splashscreen: string;
    model_file_path: string;
    experiment_name: string;
    minimal_players: string;
    maximal_players: string;
    selected_monitoring?: 'gama_screen';
}

export interface VU_CATALOG_SETTING_JSON {
    type: "catalog";
    name: string;
    splashscreen?: string;
    entries: VU_MODEL_SETTING_JSON[] | VU_CATALOG_SETTING_JSON[];
}

// Simplier version used to send useful information only to Monitor clients
export interface MIN_VU_MODEL_SETTING_JSON {
    type: string;
    name: string;
    splashscreen: string;
    model_index: number;
}

// Simplier version used to send useful information only to Monitor clients
export interface MIN_VU_CATALOG_SETTING_JSON {
    type: string;
    name: string;
    splashscreen?: string;
    entries: MIN_VU_MODEL_SETTING_JSON[]|MIN_VU_CATALOG_SETTING_JSON;
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
    GAMA    ============================================
 */

export interface GAMA_JSON_LOAD_EXPERIMENT {
    type: string,
    model: string,
    experiment: string
}

/*
    CONSTANTS   ========================================
 */
export const GAMA_ERROR_MESSAGES: string[] = [
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
    "103": "bg-black",
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

export const ON_DEVICE_ADB_GLOBAL_SETTINGS: Record<string,number|string> = {
    // Probing
    "captive_portal_detection_enabled": 0,
    "captive_portal_mode": 0,
    "captive_portal_server": "localhost",
    "captive_portal_https_url": "https://localhost",
    "captive_portal_http_url": "http://localhost",
    // WiFi
    "wifi_watchdog_on": 0,
    "wifi_watchdog_poor_network_test_enabled": 0,
    "network_recommendations_enabled": 0,
    "network_avoid_bad_wifi": 0,
    "wifi_passpoint_enabled": 0,
    "wifi_sleep_policy": 2,
    "stay_on_while_plugged_in": 15, // Keep on AC + USB + wireless + docked
    "wifi_enhance_network_while_sleeping": 0,
    // Misc
    "ota_disable_automatic_update": 1,
    "wifi_networks_available_notification_on": 0,
    "netstats_enabled": 0
}