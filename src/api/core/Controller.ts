import GamaConnector from '../simulation/GamaConnector.ts';
import PlayerManager from '../multiplayer/PlayerManager.ts';
import ModelManager from '../simulation/ModelManager.ts';
import {MonitorServer} from '../monitoring/MonitorServer.ts';
import {AdbManager} from "../android/adb/AdbManager.ts";
import {useAdb} from "../index.ts";
import {JsonPlayerAsk, JsonOutput} from "./Constants.ts";
import {mDnsService} from "../infra/mDnsService.ts";

// Override the log function
const log = (...args: any[]) => {
    console.log("\x1b[31m[CONTROLLER]\x1b[0m", ...args);
};
const logWarn = (...args: any[]) => {
    console.warn("\x1b[31m[CONTROLLER]\x1b[0m", "\x1b[43m", ...args, "\x1b[0m");
};
const logError = (...args: any[]) => {
    console.error("\x1b[31m[CONTROLLER]\x1b[0m", "\x1b[41m", ...args, "\x1b[0m");
};

export class Controller {
    model_manager: ModelManager;
    monitor_server: MonitorServer;
    player_manager: PlayerManager;
    gama_connector: GamaConnector;
    // @ts-ignore
    adb_manager: AdbManager;
    mDnsService: mDnsService;


    constructor(useAdb:boolean) {

        this.mDnsService = new mDnsService(process.env.WEB_HOSTNAME);

        this.model_manager = new ModelManager(this);
        this.monitor_server = new MonitorServer(this);
        this.player_manager = new PlayerManager(this);
        this.gama_connector = new GamaConnector(this);

        if(useAdb){
            this.adb_manager = new AdbManager(this);
        } else {
            logWarn("Couldn't find ADB working or started, cancelling ADB management")
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
        return this.model_manager.getCatalogListJSON();
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

    broadcastSimulationOutput(json_output: JsonOutput) {
        this.player_manager.broadcastSimulationOutput(json_output);
    }

    /*
    =============================
        ADB CONNECTOR
    =============================
     */
    async adbConnectNewDevice(ip: string, port: string){
        return await this.adb_manager.connectNewDevice(ip, port);
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
        log("Remove player", id_player);

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

    sendAsk(json: JsonPlayerAsk) {
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
            this.notifyMonitor();
        }, 100);
    }

    stopExperiment() {
        this.gama_connector.stopExperiment();
        this.player_manager.removeAllPlayer();

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
