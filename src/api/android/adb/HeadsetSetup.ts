
/**
 * HeadsetSetup.ts
 * ===============
 *
 * Description:
 * Handles provisioning of Quest headsets on connection:
 *   1. Apply required global ADB settings
 *   2. Ensure required apps are installed and correctly configured
 */

import { Adb, AdbServerClient } from "@yume-chan/adb";
import { ReadableStream } from "@yume-chan/stream-extra";
import { PackageManager } from "@yume-chan/android-bin";
import Device = AdbServerClient.Device;

import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { getLogger } from "@logtape/logtape";
import { ON_DEVICE_ADB_GLOBAL_SETTINGS } from "../../core/Constants.ts";

const logger = getLogger(["android", "HeadsetSetup"]);

export class HeadsetSetup {
    private adbServer: AdbServerClient;

    constructor(adbServer: AdbServerClient) {
        this.adbServer = adbServer;
    }

    async setupHeadset(device: Device) {
        // Only provision Quest headsets
        if (!device.model?.startsWith("Quest_")) return;

        let adb: Adb;
        try {
            adb = new Adb(await this.adbServer.createTransport(device));
        } catch (e) {
            logger.warn(`[${device.serial}] Could not open ADB transport — device may not be authorized yet: {e}`, { e });
            return;
        }

        await this.applyGlobalSettings(adb, device.serial);
        await this.checkRequiredApps(adb, device.serial);
    }

    private async applyGlobalSettings(adb: Adb, serial: string) {
        logger.debug(`[${serial}] Checking on-device global ADB settings...`);

        for (const [globalSetting, globalSettingValue] of Object.entries(ON_DEVICE_ADB_GLOBAL_SETTINGS) as [
                keyof typeof ON_DEVICE_ADB_GLOBAL_SETTINGS,
                typeof ON_DEVICE_ADB_GLOBAL_SETTINGS[keyof typeof ON_DEVICE_ADB_GLOBAL_SETTINGS]
            ][])
        {
            if (!await this.checkGlobalSetting(adb, globalSetting, globalSettingValue)) {
                logger.debug(`[${serial}] ADB parameters for '${globalSetting}' isn't correct, fixing it...`);
                await this.setGlobalSetting(adb, globalSetting, globalSettingValue);
                if (!await this.checkGlobalSetting(adb, globalSetting, globalSettingValue)) {
                    logger.warn(`[${serial}] Couldn't properly set setting ${globalSetting}, skipping it...`);
                }
            }
        }

        logger.debug(`[${serial}] All on-device global ADB settings are good`);
    }

    private async checkGlobalSetting(adb: Adb, globalParam: string, expectedValue: any): Promise<boolean> {
        let result: any;

        const process = await adb.subprocess.noneProtocol.spawn("settings get global " + globalParam);
        // @ts-expect-error
        for await (const chunk of process.output.pipeThrough(new TextDecoderStream())) {
            result = chunk;
        }
        result = result.trim();

        logger.trace(`[${adb.serial}] Checking ADB parameters '${globalParam}' = ${result} and should be ${expectedValue} (${result == expectedValue})`);

        return result == expectedValue;
    }

    private async setGlobalSetting(adb: Adb, globalParam: string, expectedValue: any) {
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

    private async checkRequiredApps(adb: Adb, serial: string) {
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

    private async installApk(adb: Adb, serial: string, apkPath: string): Promise<boolean> {
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
}
