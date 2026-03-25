
/**
 * AdbManager.ts
 * ===========
 *
 * Description:
 * It manages Adb sockets :)
 */

import { Adb, AdbServerClient } from "@yume-chan/adb";
import { AdbServerNodeTcpConnector } from "@yume-chan/adb-server-node-tcp";
import { ReadableStream } from "@yume-chan/stream-extra";
import { PackageManager } from "@yume-chan/android-bin";
import Device = AdbServerClient.Device;

import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

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

        const initDeviceList = await this.adbServer.getDevices(["device", "unauthorized", "offline"]);

        if (initDeviceList.length > 0) {
            for (const device of initDeviceList) {
                logger.debug(`Devices found on ADB server: {device}`, {device});
                
                // Sanitize stale ADB entries on startup (side-effect: disconnects offline ones)
                if (this.isDeviceReady(device)) {
                    // Apply M2L2 headset settings only if the device is ready
                    this.checkAdbParameters(device).catch(e =>
                        logger.error(`[${device.serial}] Unexpected error in checkAdbParameters: {e}`, { e })
                    );
                }

            }

            await this.restartStreamingAll();

        } else {
            logger.debug('No devices found on ADB server...');
        }

        // Set trigger listener for when moving devices
        this.observer.onDeviceAdd((devices) => {
            for (const device of devices) {
                logger.debug("New device added {device}\nStarting streaming for this new device...", { device });
                this.startNewStream(device).catch(e =>
                    logger.error(`[${device.serial}] Unexpected error in startNewStream: {e}`, { e })
                );
                this.checkAdbParameters(device).catch(e =>
                    logger.error(`[${device.serial}] Unexpected error in checkAdbParameters: {e}`, { e })
                );
            }
        });

        this.observer.onListChange(async (devices) => {
            // Fallback mechanism as the onRemove isn't catching everything...
            // Compare by serial — observer may return different Device instances for the same physical device.
            const activeSerials = new Set(devices.map(d => d.serial));
            const disconnected = this.clientCurrentlyStreaming.filter(d => !activeSerials.has(d.serial));

            if (disconnected.length === 0) return;

            logger.debug("A headset has been disconnected, removing it from the list...");
            for (const device of disconnected) {
                logger.warn(`[${device.serial}] Device disconnected, removing from streaming list`);
                const index = this.clientCurrentlyStreaming.findIndex(d => d.serial === device.serial);
                if (index > -1) this.clientCurrentlyStreaming.splice(index, 1);

                logger.warn(`[${device.serial}] Trying to reconnect automatically...`);
                const ip = device.serial.split(":")[0];
                const df = new DeviceFinder(this);
                let reconnected = false;
                let attempts = 0;
                const maxAttempts = 10;

                while (!reconnected && attempts < maxAttempts) {
                    attempts++;
                    reconnected = await df.scanAndConnectIP(ip);
                    if (!reconnected) {
                        logger.debug(`[${device.serial}] Reconnect attempt ${attempts}/${maxAttempts} failed, retrying in 3s...`);
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                }

                if (reconnected) {
                    logger.info(`[${device.serial}] Successfully reconnected`);
                } else {
                    logger.error(`[${device.serial}] Could not reconnect after ${maxAttempts} attempts, giving up`);
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
        if (!this.isDeviceReady(device)) return;

        // Ensure having only one streaming per device — compare by serial, not reference
        if (this.clientCurrentlyStreaming.some(d => d.serial === device.serial)) {
            logger.debug(`[${device.serial}] Already streaming. Skipping...`);
            return;
        }

        // Add new device streaming
        this.clientCurrentlyStreaming.push(device);

        try {
            const transport = await this.adbServer.createTransport(device);
            const adb = new Adb(transport);
            const model = device.model ?? 'Unknown';

            // Only consider wireless devices — check if serial is an IP address
            // startStreaming runs a supervisor loop indefinitely, so we fire-and-forget.
            // The flipWidth retry is now handled internally by runSession's metadata check.
            if (device.serial.includes(".") || ENV_VERBOSE) {
                void this.videoStreamServer.startStreaming(adb, model);
            }
        } catch (e) {
            // Remove device from streaming list — connection failed, allow retry later
            const index = this.clientCurrentlyStreaming.indexOf(device);
            if (index > -1) this.clientCurrentlyStreaming.splice(index, 1);

            const errorMsg = e instanceof Error ? e.message : String(e);
            if (errorMsg.toLowerCase().includes('unauthorized')) {
                logger.error(`[${device.serial}] Device is not authorized for ADB — accept the RSA key prompt on the device then reconnect`);
            } else {
                logger.error(`[${device.serial}] Failed to start streaming: {e}`, { e });
            }
        }
    }

    async restartStreamingAll() {
        // Reset list
        this.clientCurrentlyStreaming = [];

        // Start everyone
        for (const device of this.observer.current) {
            if (!this.isDeviceReady(device)) continue;

            await this.startNewStream(device);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    isDeviceReady(device: Device): boolean {
        let isReady = false;

        switch (device.state) {
            case "device":
                isReady = true;
                break;

            case "offline":
                logger.warn(`[${device.serial}] Device is offline, disconnecting stale entry...`);
                void this.disconnectDevice(device.serial);
                break;

            case "unauthorized":
                logger.error(`[${device.serial}] Device is not authorized — You need to manually pair the headset with this computer (accept the RSA key prompt on the device)`);
                break;

            default:
                logger.warn(`[${device.serial}] Device is not ready with an unknown state (${device.state}), skipping`);
        }
        return isReady;
    }

    /** Send reboot -p to every currently streaming ADB-connected headset */
    async shutdownAllHeadsets(): Promise<void> {
        for (const device of this.clientCurrentlyStreaming) {
            try {
                const transport = await this.adbServer.createTransport(device);
                const adb = new Adb(transport);
                await adb.subprocess.noneProtocol.spawn('reboot -p');
                logger.info(`[${device.serial}] Power-off command sent`);
            } catch (e) {
                logger.warn(`[${device.serial}] Failed to send power-off command: {e}`, { e });
            }
        }
    }

    async disconnectDevice(serial: string): Promise<void> {
        const index = this.clientCurrentlyStreaming.findIndex(d => d.serial === serial);
        if (index > -1) this.clientCurrentlyStreaming.splice(index, 1);
        try {
            await this.adbServer.wireless.disconnect(serial);
        } catch (e) {
            logger.warn(`[${serial}] Failed to wireless-disconnect: {e}`, { e });
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
        if (!this.isDeviceReady(device)) return;

        // Only modify headsets, don't jam phone's parameters
        if (!device.model?.startsWith("Quest_")) return;

        logger.debug(`[${device.serial}] Checking on-device global ADB settings...`);

        let adb: Adb;
        try {
            adb = new Adb(await this.adbServer.createTransport(device));
        } catch (e) {
            logger.warn(`[${device.serial}] Could not open ADB transport to check parameters — device may not be authorized yet: {e}`, { e });
            return;
        }

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

        await this.checkRequiredApps(adb, device.serial);
    }

    async checkRequiredApps(adb: Adb, serial: string) {
        const REQUIRED_APP = "com.tpn.adbautoenable";
        const REQUIRED_PERMISSION = "android.permission.WRITE_SECURE_SETTINGS";

        logger.debug(`[${serial}] Checking required app '${REQUIRED_APP}'...`);

        // Check if app is installed
        const pmProcess = await adb.subprocess.noneProtocol.spawn(`pm list packages ${REQUIRED_APP}`);
        let pmOutput = "";
        // @ts-expect-error
        for await (const chunk of pmProcess.output.pipeThrough(new TextDecoderStream())) {
            pmOutput += chunk;
        }

        if (!pmOutput.includes(`package:${REQUIRED_APP}`)) {
            logger.warn(`[${serial}] Required app '${REQUIRED_APP}' is not installed — installing it...`);
            const installed = await this.installApk(adb, serial, resolve("toolkit", `${REQUIRED_APP}.apk`));
            if (!installed) return;
        }
        logger.debug(`[${serial}] '${REQUIRED_APP}' is installed`);

        // Check if WRITE_SECURE_SETTINGS is already granted
        const dumpsysProcess = await adb.subprocess.noneProtocol.spawn(`dumpsys package ${REQUIRED_APP}`);
        let dumpsysOutput = "";
        // @ts-expect-error
        for await (const chunk of dumpsysProcess.output.pipeThrough(new TextDecoderStream())) {
            dumpsysOutput += chunk;
        }

        // The permission line looks like: "android.permission.WRITE_SECURE_SETTINGS: granted=true"
        const permissionGranted = dumpsysOutput.includes(`${REQUIRED_PERMISSION}: granted=true`);

        if (permissionGranted) {
            logger.debug(`[${serial}] '${REQUIRED_APP}' already has ${REQUIRED_PERMISSION}`);
            return;
        }

        logger.debug(`[${serial}] Granting ${REQUIRED_PERMISSION} to '${REQUIRED_APP}'...`);
        const grantProcess = await adb.subprocess.noneProtocol.spawn(`pm grant ${REQUIRED_APP} ${REQUIRED_PERMISSION}`);
        let grantOutput = "";
        // @ts-expect-error
        for await (const chunk of grantProcess.output.pipeThrough(new TextDecoderStream())) {
            grantOutput += chunk;
        }

        if (grantOutput.trim()) {
            logger.error(`[${serial}] Failed to grant ${REQUIRED_PERMISSION} to '${REQUIRED_APP}': ${grantOutput.trim()}`);
        } else {
            logger.info(`[${serial}] Successfully granted ${REQUIRED_PERMISSION} to '${REQUIRED_APP}'`);
        }
    }

    async installApk(adb: Adb, serial: string, apkPath: string): Promise<boolean> {
        let apkBytes: Uint8Array;
        let apkSize: number;
        try {
            apkBytes = new Uint8Array(await readFile(apkPath));
            apkSize = (await stat(apkPath)).size;
        } catch (e) {
            logger.error(`[${serial}] Could not read APK at '${apkPath}': {e}`, { e });
            return false;
        }

        try {
            const pm = new PackageManager(adb);
            await pm.installStream(apkSize, new ReadableStream({
                start: (controller) => {
                    controller.enqueue(apkBytes);
                    controller.close();
                },
            }));
            logger.info(`[${serial}] Successfully installed APK '${apkPath}'`);
            return true;
        } catch (e) {
            logger.error(`[${serial}] Failed to install APK '${apkPath}': {e}`, { e });
            return false;
        }
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
