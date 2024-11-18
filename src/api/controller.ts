import GamaConnector from './gama_connector.ts';
import PlayerManager from './PlayerManager.ts';
import ModelManager from './model-manager.ts';
import {MonitorServer} from './monitor-server.ts';
import {AdbManager} from "./adb/AdbManager.ts";
import {useAdb} from "./index.ts";
import { JsonSettings, JsonPlayer, JsonOutput } from "./constants.ts";

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

        if(useAdb) this.adb_manager = new AdbManager(this);
    }

    /*
    =============================
        MODEL MANAGER
    =============================
     */

    getSimulationInformations(): string {
        return this.model_manager.getModelListJSON();
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

    notifyPlayerChange(id_player: string, json_player: JsonPlayer) {
        this.player_manager.notifyPlayerChange(id_player, json_player);
    }

    broadcastSimulationOutput(json_output: JsonOutput) {
        this.player_manager.broadcastSimulationOutput(json_output);
    }

    /*
    =============================
        GAMA CONNECTOR
    =============================
     */

    addInGamePlayer(id_player: string) {
        this.gama_connector.addInGamePlayer(id_player);
    }

    purgePlayer(id_player: string) {
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
        // Try until simulation is ready
        const interval= setInterval(() => {
            if (!['NONE', "NOTREADY"].includes(this.gama_connector.jsonGamaState.experiment_state)) {
                // Stop calling
                clearInterval(interval);
                this.player_manager.addEveryPlayer();
            }
        }, 100);
    }

    stopExperiment() {
        this.player_manager.setRemoveInGameEveryPlayers()

        this.gama_connector.stopExperiment();

        this.notifyMonitor();
    }

    pauseExperiment(callback?: () => void) {
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
