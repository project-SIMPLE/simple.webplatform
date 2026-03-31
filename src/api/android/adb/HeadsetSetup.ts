
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
import { ON_DEVICE_ADB_GLOBAL_SETTINGS, ON_DEVICE_ADB_SHELL_SETTINGS, ON_DEVICE_OVR_PREFS } from "../../core/Constants.ts";

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
        await this.applyShellSettings(adb, device.serial);
        await this.applyOvrPrefs(adb, device.serial);
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

    private async applyShellSettings(adb: Adb, serial: string) {
        logger.debug(`[${serial}] Checking on-device shell settings...`);

        for (const args of ON_DEVICE_ADB_SHELL_SETTINGS) {
            const verbIndex = args.findIndex(a => a.startsWith("et"));
            if (verbIndex === -1) {
                logger.warn(`[${serial}] Shell setting entry has no 'et'-prefixed verb, skipping: ${args.join(" ")}`);
                continue;
            }

            const checkValue  = args[args.length - 1];

            // Get command: verb → "g"+verb, drop the last 2 elements (set_value + check_value)
            const getArgs = args.slice(0, -2).map((a, i) => i === verbIndex ? "g" + a : a);
            const getProcess = await adb.subprocess.noneProtocol.spawn(getArgs.join(" "));
            let getOutput = "";
            // @ts-expect-error
            for await (const chunk of getProcess.output.pipeThrough(new TextDecoderStream())) {
                getOutput += chunk;
            }

            logger.trace(`[${serial}] Shell check '${getArgs.join(" ")}' = '${getOutput.trim()}', expected '${checkValue}'`);

            if (getOutput.trim().includes(checkValue)) continue;

            // Set command: verb → "s"+verb, drop only the last element (check_value)
            const setArgs = args.slice(0, -1).map((a, i) => i === verbIndex ? "s" + a : a);
            logger.debug(`[${serial}] Shell setting '${setArgs.join(" ")}' isn't correct, fixing it...`);
            const setProcess = await adb.subprocess.noneProtocol.spawn(setArgs.join(" "));
            let setOutput = "";
            // @ts-expect-error
            for await (const chunk of setProcess.output.pipeThrough(new TextDecoderStream())) {
                setOutput += chunk;
            }
            if (setOutput.trim()) {
                logger.warn(`[${serial}] Shell setting command returned unexpected output: ${setOutput.trim()}`);
            }
        }

        logger.debug(`[${serial}] All on-device shell settings are good`);
    }

    private async applyOvrPrefs(adb: Adb, serial: string) {
        logger.debug(`[${serial}] Checking on-device OVR preference overrides...`);

        for (const [key, expectedValue] of Object.entries(ON_DEVICE_OVR_PREFS)) {
            const getPropProcess = await adb.subprocess.noneProtocol.spawn(`getprop persist.ovr.prefs_overrides.${key}`);
            let current = "";
            // @ts-expect-error
            for await (const chunk of getPropProcess.output.pipeThrough(new TextDecoderStream())) {
                current += chunk;
            }

            logger.trace(`[${serial}] OVR pref '${key}' = '${current.trim()}', expected '${expectedValue}'`);

            if (current.trim() === String(expectedValue)) continue;

            logger.debug(`[${serial}] OVR pref '${key}' isn't correct, fixing it...`);
            const setProcess = await adb.subprocess.noneProtocol.spawn(
                `service call PreferencesService 1 s16 "${key}" i32 ${expectedValue}`
            );
            // @ts-expect-error
            for await (const _ of setProcess.output.pipeThrough(new TextDecoderStream())) {}
        }

        logger.debug(`[${serial}] All on-device OVR preference overrides are good`);
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
        const REQUIRED_APPS: { packageName: string; apkFile: string; permission: string }[] = [
            { packageName: "com.tpn.adbautoenable", apkFile: "com.tpn.adbautoenable.apk", permission: "android.permission.WRITE_SECURE_SETTINGS" },
            { packageName: "tdg.oculuswirelessadb", apkFile: "tdg.oculuswirelessadb.apk", permission: "android.permission.WRITE_SECURE_SETTINGS" },
        ];

        for (const { packageName, apkFile, permission } of REQUIRED_APPS) {
            const targetVersion = this.parseApkVersion(apkFile);
            logger.debug(`[${serial}] Checking '${packageName}'${targetVersion ? ` (target: v${targetVersion})` : ''}...`);

            const isInstalled = await this.isPackageInstalled(adb, packageName);

            if (!isInstalled) {
                logger.warn(`[${serial}] '${packageName}' is not installed — installing...`);
                if (!await this.installApk(adb, serial, resolve("toolkit", apkFile))) continue;
            } else if (targetVersion) {
                const installedVersion = await this.getInstalledVersion(adb, packageName);
                if (!installedVersion || this.compareVersions(installedVersion, targetVersion) < 0) {
                    logger.info(`[${serial}] '${packageName}' v${installedVersion ?? '?'} → v${targetVersion} — uninstalling first (signature may differ)...`);
                    await this.uninstallPackage(adb, serial, packageName);
                    if (!await this.installApk(adb, serial, resolve("toolkit", apkFile))) continue;
                } else {
                    logger.debug(`[${serial}] '${packageName}' is up to date (v${installedVersion})`);
                }
            }

            await this.ensurePermission(adb, serial, packageName, permission);
        }
    }

    private parseApkVersion(apkFile: string): string | null {
        const match = apkFile.match(/-(\d+(?:\.\d+)+)\.apk$/);
        return match ? match[1] : null;
    }

    private compareVersions(a: string, b: string): number {
        const pa = a.split('.').map(Number);
        const pb = b.split('.').map(Number);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
            if (diff !== 0) return diff;
        }
        return 0;
    }

    private async isPackageInstalled(adb: Adb, packageName: string): Promise<boolean> {
        const process = await adb.subprocess.noneProtocol.spawn(`pm list packages ${packageName}`);
        let output = "";
        // @ts-expect-error
        for await (const chunk of process.output.pipeThrough(new TextDecoderStream())) {
            output += chunk;
        }
        return output.includes(`package:${packageName}`);
    }

    private async getInstalledVersion(adb: Adb, packageName: string): Promise<string | null> {
        const process = await adb.subprocess.noneProtocol.spawn(`dumpsys package ${packageName}`);
        let output = "";
        // @ts-expect-error
        for await (const chunk of process.output.pipeThrough(new TextDecoderStream())) {
            output += chunk;
        }
        return output.match(/versionName=(\S+)/)?.[1] ?? null;
    }

    private async uninstallPackage(adb: Adb, serial: string, packageName: string): Promise<void> {
        const process = await adb.subprocess.noneProtocol.spawn(`pm uninstall ${packageName}`);
        let output = "";
        // @ts-expect-error
        for await (const chunk of process.output.pipeThrough(new TextDecoderStream())) {
            output += chunk;
        }
        if (!output.trim().includes("Success")) {
            logger.warn(`[${serial}] Uninstall of '${packageName}' returned: ${output.trim()}`);
        }
    }

    private async ensurePermission(adb: Adb, serial: string, packageName: string, permission: string): Promise<void> {
        const process = await adb.subprocess.noneProtocol.spawn(`dumpsys package ${packageName}`);
        let output = "";
        // @ts-expect-error
        for await (const chunk of process.output.pipeThrough(new TextDecoderStream())) {
            output += chunk;
        }

        if (output.includes(`${permission}: granted=true`)) {
            logger.debug(`[${serial}] '${packageName}' already has ${permission}`);
            return;
        }

        logger.debug(`[${serial}] Granting ${permission} to '${packageName}'...`);
        const grantProcess = await adb.subprocess.noneProtocol.spawn(`pm grant ${packageName} ${permission}`);
        let grantOutput = "";
        // @ts-expect-error
        for await (const chunk of grantProcess.output.pipeThrough(new TextDecoderStream())) {
            grantOutput += chunk;
        }

        if (grantOutput.trim()) {
            logger.error(`[${serial}] Failed to grant ${permission} to '${packageName}': ${grantOutput.trim()}`);
        } else {
            logger.info(`[${serial}] Successfully granted ${permission} to '${packageName}'`);
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
