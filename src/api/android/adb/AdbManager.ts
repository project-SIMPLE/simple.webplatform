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

import Controller from "../../core/Controller.ts";
import {ENV_EXTRA_VERBOSE, ENV_VERBOSE} from "../../index.ts";
import {ScrcpyServer} from "../scrcpy/ScrcpyServer.ts";

// Override the log function
const log = (...args: any[]) => {
    console.log("\x1b[36m[ADB MANAGER]\x1b[0m", ...args);
};
const logWarn = (...args: any[]) => {
    console.warn("\x1b[36m[ADB MANAGER]\x1b[0m", "\x1b[43m", ...args, "\x1b[0m");
};
const logError = (...args: any[]) => {
    console.error("\x1b[36m[ADB MANAGER]\x1b[0m", "\x1b[41m", ...args, "\x1b[0m");
};

export class AdbManager {
    controller: Controller;
    adbServer!: AdbServerClient;
    videoStreamServer: ScrcpyServer;
    // Keep list of serial of devices with a stream already starting
    clientCurrentlyStreaming: Device[] = [];
    observer!: AdbServerClient.DeviceObserver;//!: AdbServerClient;

    constructor(controller: Controller) {
        this.controller = controller;
        try {
            this.adbServer = new AdbServerClient(
                new AdbServerNodeTcpConnector({ host: '127.0.0.1', port: 5037 })
            );
        }catch (e) {
            logError("Can't connect to device's ADB server", e);
        }
        log("Connect to device's ADB server");

        this.videoStreamServer = new ScrcpyServer();

        (async () => {
            // Init watching ADB clients
            this.observer = await this.adbServer.trackDevices();

            if ( this.observer.current.length > 0){
                if (ENV_VERBOSE) for (const device of this.observer.current) {
                    log('Devices found on ADB server:', device);
                }

                // startStreamingForAll
                for (const device of this.observer.current) {
                    await this.startStreaming(device);

                    // Cooldown to let client properly create streams' canvas
                    if (ENV_VERBOSE) log("Waiting 2s before starting a new stream...");
                    await new Promise( resolve => setTimeout(resolve, 2000) );
                }
                // !startStreamingForAll

            } else {
                if (ENV_VERBOSE) log('No devices found on ADB server...');
            }

            this.observer.onDeviceAdd((devices) => {
                for (const device of devices) {
                    if (ENV_VERBOSE) log("New device added", device);
                    this.startStreaming(device);
                }
            });

            this.observer.onDeviceRemove((devices) => {
                logWarn("A device has been removed");
                for (const device of devices) {
                    logWarn(device);
                    this.clientCurrentlyStreaming.filter((ele,) => ele !== device)
                }
            });

            this.observer.onListChange((devices) => {
                // Fallback mechanism as the onRemove isn't catching everything...
                if (devices.length < this.clientCurrentlyStreaming.length){
                    if (ENV_VERBOSE) logWarn("A headset has been disconnected and is not well represented");
                    for (const device of this.clientCurrentlyStreaming) {
                        if (!devices.includes(device)){
                            logWarn("A device has been removed", device);
                            this.clientCurrentlyStreaming.filter((ele,) => ele !== device)
                        }
                    }
                    logWarn(this.clientCurrentlyStreaming.length);
                }
            });

        })();
    }

    async startStreaming(device: Device) {
        // Ensure having only one streaming per device
        if(this.clientCurrentlyStreaming.includes(device)) {
            if (ENV_VERBOSE) logWarn('Device', device.serial, 'already streaming. Skipping new stream...');
            return;
        }else{
            // Add new device streaming
            this.clientCurrentlyStreaming.push(device);

            const transport = await this.adbServer.createTransport(device);
            const adb = new Adb(transport);

            if (device.serial.includes(".")) {// Only consider wireless devices - Check if serial is an IP address
                if (ENV_VERBOSE) log('Starting streaming for :', device.serial);
                await this.videoStreamServer.startStreaming(adb, device.model!);
            }
        }

    }

    async connectNewDevice(ip: string, port: string): Promise<boolean> {
        let success: boolean = false;

        try{
            await this.adbServer.wireless.connect(ip + ':' + port);
            success = true;
        }catch (e) {
            if (ENV_EXTRA_VERBOSE) logError("Couldn't connect with this error message", e)
        }

        return success
    }

}