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
import {ENV_EXTRA_VERBOSE} from "../../index.ts";
import {ScrcpyServer} from "../scrcpy/ScrcpyServer.ts";
import {getLogger} from "@logtape/logtape";
import DeviceFinder from "./DeviceFinder.ts";

// Override the log function
const logger= getLogger(["android", "AdbManager"]);

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
            logger.error(`Can't connect to device's ADB server ${e}`);
        }
        logger.info("Connect to device's ADB server");

        this.videoStreamServer = new ScrcpyServer(this);
    }

    async init(){
        // Init watching ADB clients
        this.observer = await this.adbServer.trackDevices();

        if ( this.observer.current.length > 0){
            for (const device of this.observer.current) {
                logger.debug(`Devices found on ADB server: ${device}`);
            }

            await this.restartStreamingAll();

        } else {
            logger.debug('No devices found on ADB server...');
        }


        // Set trigger listener for when moving devices
        this.observer.onDeviceAdd((devices) => {
            for (const device of devices) {
                logger.debug("New device added {device}\nStarting streaming for this new device...", {device});
                this.startStreaming(device);
            }
        });

        this.observer.onDeviceRemove((devices) => {
            logger.warn("A device has been removed");
            for (const device of devices) {
                logger.warn(`${device}`);
                this.clientCurrentlyStreaming.filter((ele,) => ele !== device)
            }
        });

        this.observer.onListChange((devices) => {
            // Fallback mechanism as the onRemove isn't catching everything...
            if (devices.length < this.clientCurrentlyStreaming.length){
                logger.debug("A headset has been disconnected and is not well represented");
                for (const device of this.clientCurrentlyStreaming) {
                    if (!devices.includes(device)){
                        logger.warn(`A device has been removed ${device}`);
                        this.clientCurrentlyStreaming.filter((ele,) => ele !== device)
                    }
                }
                logger.warn(`${this.clientCurrentlyStreaming.length}`);
            }
        });

        /*
            Pro-actively looking for Meta Quest devices to connect with ADB using an external script
         */
        try {
            await new DeviceFinder(this).scanAndConnect(true);
        } catch (error) {
            logger.error("Error: {error}", {error});
        }
    }

    async startStreaming(device: Device) {
        // Ensure having only one streaming per device
        if(this.clientCurrentlyStreaming.includes(device)) {
            logger.debug(`Device ${device.serial} already streaming. Skipping new stream...`);
            return;
        }else{
            // Add new device streaming
            this.clientCurrentlyStreaming.push(device);

            const transport = await this.adbServer.createTransport(device);
            const adb = new Adb(transport);

            ///if (device.serial.includes(".")) {// Only consider wireless devices - Check if serial is an IP address
                logger.debug(`Starting streaming for: ${device.serial}`);
                await this.videoStreamServer.startStreaming(adb, device.model!);
            // }
        }
    }

    async restartStreamingAll() {
        // Reset list
        this.clientCurrentlyStreaming = [];

        // Start everyone
        for (const device of this.observer.current) {
            await this.startStreaming(device);
            await new Promise( resolve => setTimeout(resolve, 2000) );
        }
    }

    async connectNewDevice(ip: string, port: string): Promise<boolean> {
        let success: boolean = false;

        try{
            await this.adbServer.wireless.connect(ip + ':' + port);
            success = true;
        }catch (e) {
            if (ENV_EXTRA_VERBOSE) logger.error(`Couldn't connect with this error message ${e}`);
        }

        return success
    }

}
