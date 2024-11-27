/**
 * AdbManager.ts
 * ===========
 *
 * Description:
 * It manages Adb sockets :)
 */

import {Adb, AdbServerClient} from "@yume-chan/adb";
import {AdbServerNodeTcpConnector} from "@yume-chan/adb-server-node-tcp";
import Device = AdbServerClient.Device;

import Controller from "../controller.ts";
import {useVerbose} from "../index.ts";
import {ScrcpyServer} from "../scrcpy/ScrcpyServer.ts";

export class AdbManager {
    controller: Controller;
    adbServer!: AdbServerClient;
    adbClientList!: Device[];
    videoStreamServer: ScrcpyServer;
    // Keep list of serial of devices with a stream already starting
    clientCurrentlyStreaming: string[] = [];

    constructor(controller: Controller) {
        this.controller = controller;
        try {
            this.adbServer = new AdbServerClient(
                new AdbServerNodeTcpConnector({ host: '127.0.0.1', port: 5037 })
            );
        }catch (e) {
            console.error("[ADB MANAGER] Can't connect to device's ADB server", e);
        }
        console.log("[ADB MANAGER] Connect to device's ADB server");

        this.videoStreamServer = new ScrcpyServer();

        (async () => {
            await this.getClientList();

            // If some devices are already connected, starting streaming for those
            if (this.adbClientList.length != 0){
                await this.startStreamingForAll();
            }
        })();
    }

    async getClientList() {
        this.adbClientList = await this.adbServer.getDevices();
        if (this.adbClientList.length) {
            if (useVerbose) console.log('[ADB MANAGER] Devices found on ADB server:', this.adbClientList);
        } else {
            if (useVerbose) console.log('[ADB MANAGER] No devices found on ADB server...');
        }
    }

    async startStreamingForAll() {
        for (const device of this.adbClientList) {
            await this.startStreaming(device.serial);

            // Cooldown to let client properly create streams' canvas
            if (useVerbose) console.log("[ADB MANAGER] Waiting 2s before starting a new stream...");
            await new Promise( resolve => setTimeout(resolve, 2000) );
        }
    }

    async startStreaming(serial: string) {
        // Ensure having only one streaming per device
        if(this.clientCurrentlyStreaming.includes(serial)) {
            if (useVerbose) console.warn('[ADB MANAGER] Device', serial, 'already streaming. Skipping new stream...');
            return;
        }else{
            // Add new device streaming
            this.clientCurrentlyStreaming.push(serial);

            const deviceToStream = this.adbClientList.find(client => client.serial === serial);

            const transport = await this.adbServer.createTransport(deviceToStream);
            const adb = new Adb(transport);

            if (useVerbose) console.log('[ADB MANAGER] Starting streaming for :', serial);

            await this.videoStreamServer.startStreaming(adb);
        }

    }

}