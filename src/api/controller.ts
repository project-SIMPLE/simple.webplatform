// @ts-ignore
import GamaConnector from './gama_connector.js';
// @ts-ignore
import MonitorServer from './monitor-server.js';
// @ts-ignore
import PlayerServer from './player-server.js';
// @ts-ignore
import ModelManager from './model-manager.js';
import AdbManager from "./adb/TCPSocket.ts";


import type { ReadableWritablePair } from "@yume-chan/stream-extra";

interface JsonSettings {
    // Define the structure of your JSON settings here
}

interface JsonPlayer {
    // Define the structure of your JSON player here
}

interface JsonOutput {
    // Define the structure of your JSON output here
}

class Controller {
    choosedLearningPackageIndex: number;
    modelManager: ModelManager;
    monitor_server: MonitorServer;
    player_server: PlayerServer;
    gama_connector: GamaConnector;
    adb_manager: AdbManager;

    constructor() {
        this.choosedLearningPackageIndex = 0;
        /*this.modelManager = new ModelManager(this);
        this.monitor_server = new MonitorServer(this);
        this.player_server = new PlayerServer(this);
        this.gama_connector = new GamaConnector(this);*/
        this.adb_manager = new AdbManager();

        console.log("Connecting to tablet");
        //this.adb_manager.connectDevice('192.168.1.93', '46205');

        const device: AdbDaemonDirectSocketsDevice = new AdbDaemonDirectSocketsDevice({
            host: "192.168.50.30",
            port: 5555,
        });

        const connection: ReadableWritablePair<
            AdbPacketData,
            Consumable<AdbPacketInit>
        > = await device.connect();
    }

    restart() {
        this.player_server.close();
        this.gama_connector.close();
        this.monitor_server.close();
        this.player_server = new PlayerServer(this);
        this.gama_connector = new GamaConnector(this);
        this.monitor_server = new MonitorServer(this);
    }

    changeJsonSettings(json_settings: JsonSettings) {
        this.modelManager.setJsonSettings(json_settings);
    }

    getSimulationInformations(): JsonSettings {
        return this.modelManager.getModelListJSON();
    }

    getPlayerList() {
        return this.modelManager.getListPlayers();
    }

    notifyMonitor() {
        this.monitor_server.sendMonitorJsonState();
    }

    notifyPlayerChange(id_player: number, json_player: JsonPlayer) {
        this.player_server.notifyPlayerChange(id_player, json_player);
    }

    broadcastSimulationOutput(json_output: JsonOutput) {
        this.player_server.broadcastSimulationOutput(json_output);
    }

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
        this.gama_connector.removeInGamePlayer(id_player);
    }

    cleanAll() {
        this.player_server.cleanAll();
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

    pauseExperiment() {
        this.gama_connector.pauseExperiment();
    }

    resumeExperiment() {
        this.gama_connector.resumeExperiment();
    }

    connectGama() {
        this.gama_connector.connectGama();
    }
}

export default Controller;