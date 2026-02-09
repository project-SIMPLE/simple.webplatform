
/**
 * AdbManager.ts
 * ===========
 *
 * Description:
 * It manages Adb sockets :)
 */

import { Adb, AdbServerClient } from "@yume-chan/adb";
import { AdbServerNodeTcpConnector } from "@yume-chan/adb-server-node-tcp";
import Device = AdbServerClient.Device;

import Controller from "../../core/Controller.ts";
import { ENV_EXTRA_VERBOSE, ENV_VERBOSE } from "../../index.ts";
import { ScrcpyServer } from "../scrcpy/ScrcpyServer.ts";
import { getLogger } from "@logtape/logtape";
import DeviceFinder from "./DeviceFinder.ts";
import {ON_DEVICE_ADB_GLOBAL_SETTINGS} from "../../core/Constants.ts";

// Override the log function
const logger = getLogger(["android", "AdbManager"]);

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
        } catch (e) {
            logger.error(`Can't connect to device's ADB server ${e}`);
        }
        logger.info("Connect to device's ADB server");

        this.videoStreamServer = new ScrcpyServer(this);
    }

    async init() {
        // Init watching ADB clients
        this.observer = await this.adbServer.trackDevices();

        if (this.observer.current.length > 0) {
            for (const device of this.observer.current) {
                logger.debug(`Devices found on ADB server: {device}`, {device});
                this.checkAdbParameters(device);
            }

            await this.restartStreamingAll();

        } else {
            logger.debug('No devices found on ADB server...');
        }


        // Set trigger listener for when moving devices
        this.observer.onDeviceAdd((devices) => {
            for (const device of devices) {
                logger.debug("New device added {device}\nStarting streaming for this new device...", { device });
                this.startNewStream(device);
                this.checkAdbParameters(device);
            }
        });

        this.observer.onListChange((devices) => {
            // Fallback mechanism as the onRemove isn't catching everything...
            if (devices.length < this.clientCurrentlyStreaming.length) {
                logger.debug("A headset has been disconnected, removing it from the list...");
                for (const device of this.clientCurrentlyStreaming) {
                    if (!devices.includes(device)) {
                        logger.warn(`This device has been removed {device}`, {device});

                        const index = this.clientCurrentlyStreaming.indexOf(device);
                        if (index > -1) {
                            this.clientCurrentlyStreaming.splice(index, 1);
                        }
                    }
                }
            }
        });

        /*
            Pro-actively looking for Meta Quest devices to connect with ADB using an external script
         */
        try {
            await new DeviceFinder(this).scanAndConnect(true);
        } catch (error) {
            logger.error("Error: {error}", { error });
        }
    }

    async startNewStream(device: Device) {
        // Ensure having only one streaming per device
        if (this.clientCurrentlyStreaming.includes(device)) {
            logger.debug(`Device ${device.serial} already streaming. Skipping new stream...`);
            return;
        } else {
            // Add new device streaming
            this.clientCurrentlyStreaming.push(device);

            const transport = await this.adbServer.createTransport(device);
            const adb = new Adb(transport);

            if (device.serial.includes(".") || ENV_VERBOSE) {// Only consider wireless devices - Check if serial is an IP address
                if ( ! await this.videoStreamServer.startStreaming(adb, device.model!) ) {
                    await this.videoStreamServer.startStreaming(adb, device.model!, true);
                }
            }
        }
    }

    async restartStreamingAll() {
        // Reset list
        this.clientCurrentlyStreaming = [];

        // Start everyone
        for (const device of this.observer.current) {
            await this.startNewStream(device);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    async connectNewDevice(ip: string, port: string): Promise<boolean> {
        let success: boolean = false;

        let alreadyConnected: boolean = false;
        logger.debug(`Checking if ${ip} is already connected...`);
        for (const device of this.observer.current) {
            if (device.serial.startsWith(ip)) {
                logger.debug(`${ip} is already connected ! Skipping new device...`);
                alreadyConnected = success = true;
            }
        }

        if (!alreadyConnected) {
            try {
                await this.adbServer.wireless.connect(ip + ':' + port);
                success = true;
            } catch (e) {
                if (ENV_EXTRA_VERBOSE) logger.error(`Couldn't connect with this error message ${e}`);
            }
        }

        return success
    }

    async checkAdbParameters(device: Device) {
        // Only modify headsets, don't jam phone's parameters
        if (!device.model?.startsWith("Quest_")) return;

        logger.debug(`[${device.serial}] Checking on-device global ADB settings...`);
        const transport = await this.adbServer.createTransport(device);
        const adb = new Adb(transport);

        for (const [globalSetting, globalSettingValue] of Object.entries(ON_DEVICE_ADB_GLOBAL_SETTINGS) as [
                keyof typeof ON_DEVICE_ADB_GLOBAL_SETTINGS,
                typeof ON_DEVICE_ADB_GLOBAL_SETTINGS[keyof typeof ON_DEVICE_ADB_GLOBAL_SETTINGS]
            ][])
        {
            if ( ! await this.checkAdbParameter(adb, globalSetting, globalSettingValue)){
                logger.debug(`[${device.serial}] ADB parameters for '${globalSetting}' isn't correct, fixing it...`);
                await this.setAdbParameter(adb, globalSetting, globalSettingValue);
                if (! await this.checkAdbParameter(adb, globalSetting, globalSettingValue)) {
                    logger.warn(`[${device.serial}] Couldn't properly set setting ${globalSetting}, skipping it...`);
                }
            }
        }
        logger.debug(`[${device.serial}] All on-device global ADB settings are good`);
    }

    async checkAdbParameter(adb: Adb, globalParam: string, expectedValue: any): Promise<boolean> {
        let result: any;

        const process = await adb.subprocess.noneProtocol.spawn("settings get global " + globalParam);
        // @ts-expect-error
        for await (const chunk of process.output.pipeThrough(new TextDecoderStream())) {
            result = chunk;
        }
        // Cleaning trailing '\n' from chunk reading
        result = result.trim();

        logger.trace(`[${adb.serial}] Checking ADB parameters '${globalParam}' = ${result} and should be ${expectedValue} (${result == expectedValue})`);

        return result == expectedValue;
    }

    async setAdbParameter(adb: Adb, globalParam: string, expectedValue: any) {
        let result: any;

        const process = await adb.subprocess.noneProtocol.spawn(["settings put global ", globalParam, expectedValue]);
        // @ts-expect-error
        for await (const chunk of process.output.pipeThrough(new TextDecoderStream())) {
            result = chunk;
        }

        logger.trace(`[${adb.serial}] Setting ADB parameters '${globalParam}' = ${expectedValue} and it ${result == undefined ? "worked" : "failed"}`);

        if (result != undefined) {
            logger.error(`[${adb.serial}] Something happened while setting the ADB setting '${globalParam}'`);
            logger.error(result.toString());
        }
    }

}
