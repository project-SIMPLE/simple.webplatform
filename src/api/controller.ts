import GamaConnector from './gama_connector.ts';
import PlayerManager from './PlayerManager.ts';
import ModelManager from './model-manager.ts';
import {MonitorServer} from './monitor-server.ts';
import {AdbManager} from "./adb/AdbManager.ts";
import {useAdb} from "./index.ts";

interface JsonSettings {
    // Define the structure of your JSON settings here
}

interface JsonPlayer {
    // Define the structure of your JSON player here
}

interface JsonOutput {
    // Define the structure of your JSON output here
}

export class Controller {
    model_manager: ModelManager;
    monitor_server: MonitorServer;
    player_manager: PlayerManager;
    gama_connector: GamaConnector;
    // @ts-ignore
    adb_manager: AdbManager;

    constructor(useAdb:boolean) {
        this.model_manager = new ModelManager(this);
        this.monitor_server = new MonitorServer(this);
        this.player_manager = new PlayerManager(this);
        this.gama_connector = new GamaConnector(this);

        if(useAdb){
            this.adb_manager = new AdbManager(this);
        } else {
            console.warn("[CONTROLLER] Couldn't find ADB working or started, cancelling ADB management")
        }
    }

    restart() {
        this.player_manager.close();
        this.gama_connector.close();
        this.monitor_server.close();
        this.player_manager = new PlayerManager(this);
        this.gama_connector = new GamaConnector(this);
        this.monitor_server = new MonitorServer(this);

        this.adb_manager = new AdbManager(this);
    }

    /*
    =============================
        MODEL MANAGER
    =============================
     */

    getSimulationInformations(): JsonSettings {
        return this.model_manager.getModelListJSON();
    }

    getPlayerList() {
        return this.model_manager.getListPlayers();
    }

    /*
    =============================
        WS MONITOR
    =============================
     */

    notifyMonitor() {
        this.monitor_server.sendMonitorGamaState();
    }

    /*
    =============================
        PLAYER SERVER
    =============================
     */

    notifyPlayerChange(id_player: number, json_player: JsonPlayer) {
        this.player_manager.notifyPlayerChange(id_player, json_player);
    }

    broadcastSimulationOutput(json_output: JsonOutput) {
        this.player_manager.broadcastSimulationOutput(json_output);
    }

    cleanAll() {
        this.player_manager.cleanAll();
    }

    /*
    =============================
        GAMA CONNECTOR
    =============================
     */

    removeInGameEveryPlayers() {
        this.gama_connector.removeInGameEveryPlayers();
    }

    addInGameEveryPlayers() {
        this.gama_connector.addInGameEveryPlayers();
    }

    addInGamePlayer(id_player: string) {
        this.gama_connector.addInGamePlayer(id_player);
    }

    removeInGamePlayer(id_player: string) {
        console.log("[CONNECTOR] Remove player", id_player);

        // Remove from GAMA
        this.gama_connector.removeInGamePlayer(id_player);
        // Remove from connected list
        this.player_manager.removePlayer(id_player);

        // Close application for headset
        if(useAdb){
            // TODO
        }

        // Inform webview of update state
        this.notifyMonitor();
    }

    sendExpression(id_player: string, expr: string) {
        this.gama_connector.sendExpression(id_player, expr);
    }

    sendAsk(json: JsonSettings) {
        this.gama_connector.sendAsk(json);
    }

    launchExperiment() {
        this.gama_connector.launchExperiment();
    }

    stopExperiment() {
        this.gama_connector.stopExperiment();
    }

    pauseExperiment(callback: () => void) {
        this.gama_connector.pauseExperiment(callback);
    }

    resumeExperiment() {
        this.gama_connector.resumeExperiment();
    }

    connectGama() {
        this.gama_connector.connectGama();
    }
}

export default Controller;
