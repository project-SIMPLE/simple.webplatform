// @ts-ignore
import GamaConnector from './gama_connector.js';
import {MonitorServer} from './monitor-server.ts';
// @ts-ignore
import PlayerServer from './player-server.js';
// @ts-ignore
import ModelManager from './model-manager.js';
import {AdbManager} from "./adb/AdbManager.ts";
import {AdbServerNodeTcpConnector}from '@yume-chan/adb-server-node-tcp'

import {VideoStreamServer} from "./scrcpy/VideoStreamServer.ts";
import { Adb, AdbServerClient } from "@yume-chan/adb";

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
    choosedLearningPackageIndex: number;
    modelManager: ModelManager;
    monitor_server: MonitorServer;
    player_server: PlayerServer;
    gama_connector: GamaConnector;
    adb_manager: AdbManager;
    video_stream_server: VideoStreamServer;

    constructor() {
        this.choosedLearningPackageIndex = 0;
        this.modelManager = new ModelManager(this);
        this.monitor_server = new MonitorServer(this);
        this.player_server = new PlayerServer(this);
        this.gama_connector = new GamaConnector(this);

        this.adb_manager = new AdbManager();

        this.video_stream_server = new VideoStreamServer();
    }

    restart() {
        this.player_server.close();
        this.gama_connector.close();
        this.monitor_server.close();
        this.player_server = new PlayerServer(this);
        this.gama_connector = new GamaConnector(this);
        this.monitor_server = new MonitorServer(this);

        this.adb_manager = new AdbManager();
    }

    /*
    =============================
        ADB MANAGER
    =============================
     */
  async adbDummyClient() {
    const ipAndroid: string = "192.168.1.93";
    await this.adb_manager.addDevice(ipAndroid);
    console.log("Tablet added to android ===")
    // @ts-ignore
    const adbConnection: Adb = this.adb_manager.getAdbConnections().get(ipAndroid);
      await this.video_stream_server.startStreaming(adbConnection);

    // const connector = new AdbServerNodeTcpConnector({ host: '127.0.0.1', port: 5037 });
    // const client = new AdbServerClient(connector);
    // const devices = await client.getDevices();
    // if (devices.length) {
    //   console.log('found device');
    //   const transport = await client.createTransport(devices[0]);
    //   const adb = new Adb(transport);
    //   await this.video_stream_server.startStreaming(adb);
    // }
  }

    /*
    =============================
        MODEL MANAGER
    =============================
     */

    changeJsonSettings(json_settings: JsonSettings) {
        this.modelManager.setJsonSettings(json_settings);
    }

    getSimulationInformations(): JsonSettings {
        return this.modelManager.getModelListJSON();
    }

    getPlayerList() {
        return this.modelManager.getListPlayers();
    }

    /*
    =============================
        WS MONITOR
    =============================
     */

    notifyMonitor() {
        this.monitor_server.sendMonitorJsonState();
    }

    /*
    =============================
        PLAYER SERVER
    =============================
     */

    notifyPlayerChange(id_player: number, json_player: JsonPlayer) {
        this.player_server.notifyPlayerChange(id_player, json_player);
    }

    broadcastSimulationOutput(json_output: JsonOutput) {
        this.player_server.broadcastSimulationOutput(json_output);
    }

    cleanAll() {
        this.player_server.cleanAll();
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
        this.gama_connector.removeInGamePlayer(id_player);
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
