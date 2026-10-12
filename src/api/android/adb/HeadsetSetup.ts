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
import { PackageManager } from "@yume-chan/android-bin";
import { ReadableStream } from "@yume-chan/stream-extra";

import Device = AdbServerClient.Device;

import { readFile, stat } from "node:fs/promises";

import { getLogger } from "@logtape/logtape";
import {
	ON_DEVICE_ADB_BROADCASTS,
	ON_DEVICE_ADB_GLOBAL_SETTINGS,
	ON_DEVICE_ADB_SECURE_SETTINGS,
	ON_DEVICE_ADB_SHELL_SETTINGS,
	ON_DEVICE_ADB_SYSTEM_SETTINGS,
	ON_DEVICE_OVR_PREFS,
} from "../../core/Constants.ts";
import { resolveToolkitAsset } from "../../infra/ToolkitAssets.ts";
import { readApkVersionName } from "./ApkInspector.ts";

const logger = getLogger(["android", "HeadsetSetup"]);

/**
 * Resolve the target version of a toolkit APK. Fast path: a dotted version encoded
 * in the filename (e.g. "MyApp-1.2.3.apk"). Slow path: crack the APK open and read
 * android:versionName from its compiled manifest (via ApkInspector). Returns null
 * when neither is available.
 */
export async function parseApkVersion(apkFile: string): Promise<string | null> {
	const fileNameMatch = apkFile.match(/-(\d+(?:\.\d+)+)\.apk$/);
	if (fileNameMatch !== null) return fileNameMatch[1];

	try {
		const apkBytes = await readFile(resolveToolkitAsset(apkFile));
		return readApkVersionName(apkBytes);
	} catch (e) {
		logger.warn(`Could not inspect version of APK '${apkFile}': {e}`, { e });
		return null;
	}
}

/**
 * Compare two dotted version strings. Returns a negative number when a < b,
 * a positive number when a > b, and 0 when they are equal. Missing segments
 * are treated as 0 (so "1.2" === "1.2.0").
 */
export function compareVersions(a: string, b: string): number {
	const pa = a.split(".").map(Number);
	const pb = b.split(".").map(Number);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (diff !== 0) return diff;
	}
	return 0;
}

export interface ShellGetSet {
	verbIndex: number;
	/** The expected value the `get` output should contain. */
	checkValue: string;
	/** Args for the get command (verb prefixed with "g"). */
	getArgs: string[];
	/** Args for the set command (verb prefixed with "s"). */
	setArgs: string[];
}

/**
 * Derive the get/set adb-shell commands from a shell-setting entry. Each entry
 * carries an "et"-prefixed verb; the get form prepends "g" and drops the last two
 * elements (set_value + check_value), the set form prepends "s" and drops only the
 * check_value. Returns null when no "et"-prefixed verb is present.
 */
export function deriveShellGetSet(args: string[]): ShellGetSet | null {
	const verbIndex = args.findIndex((a) => a.startsWith("et"));
	if (verbIndex === -1) return null;
	const checkValue = args[args.length - 1];
	const getArgs = args.slice(0, -2).map((a, i) => (i === verbIndex ? `g${a}` : a));
	const setArgs = args.slice(0, -1).map((a, i) => (i === verbIndex ? `s${a}` : a));
	return { verbIndex, checkValue, getArgs, setArgs };
}

/** True if `packageName` is installed on the device (via `pm list packages`). */
export async function isPackageInstalled(adb: Adb, packageName: string): Promise<boolean> {
	const output = await adb.subprocess.noneProtocol.spawn(`pm list packages ${packageName}`).wait().toString();
	return output.includes(`package:${packageName}`);
}

/** Installed `versionName` of `packageName` (via `dumpsys package`), or null if absent. */
export async function getInstalledVersion(adb: Adb, packageName: string): Promise<string | null> {
	const output = await adb.subprocess.noneProtocol.spawn(`dumpsys package ${packageName}`).wait().toString();
	return output.match(/versionName=(\S+)/)?.[1] ?? null;
}

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
		await this.applySystemSettings(adb, device.serial);
		await this.applySecureSettings(adb, device.serial);
		await this.applyShellSettings(adb, device.serial);
		await this.applyOvrPrefs(adb, device.serial);
		await this.applyBroadcasts(adb, device.serial);
		await this.checkAvoidingApps(adb, device.serial);
		await this.checkRequiredApps(adb, device.serial);
	}

	private async applyGlobalSettings(adb: Adb, serial: string) {
		logger.debug(`[${serial}] Checking on-device global ADB settings...`);

		for (const [key, value] of Object.entries(ON_DEVICE_ADB_GLOBAL_SETTINGS)) {
			if (!(await this.checkSetting(adb, "global", key, value))) {
				logger.debug(`[${serial}] Global setting '${key}' isn't correct, fixing it...`);
				await this.setSetting(adb, "global", key, value);
				if (!(await this.checkSetting(adb, "global", key, value))) {
					logger.warn(`[${serial}] Couldn't properly set global setting '${key}', skipping it...`);
				}
			}
		}

		logger.debug(`[${serial}] All on-device global ADB settings are good`);
	}

	private async applyShellSettings(adb: Adb, serial: string) {
		logger.debug(`[${serial}] Checking on-device shell settings...`);

		for (const args of ON_DEVICE_ADB_SHELL_SETTINGS) {
			const derived = deriveShellGetSet(args);
			if (!derived) {
				logger.warn(`[${serial}] Shell setting entry has no 'et'-prefixed verb, skipping: ${args.join(" ")}`);
				continue;
			}

			const { checkValue, getArgs, setArgs } = derived;

			const getOutput = await adb.subprocess.noneProtocol.spawn(getArgs.join(" ")).wait().toString();

			logger.trace(`[${serial}] Shell check '${getArgs.join(" ")}' = '${getOutput.trim()}', expected '${checkValue}'`);

			if (getOutput.trim().includes(checkValue)) continue;

			logger.debug(`[${serial}] Shell setting '${setArgs.join(" ")}' isn't correct, fixing it...`);
			const setOutput = await adb.subprocess.noneProtocol.spawn(setArgs.join(" ")).wait().toString();
			if (setOutput.trim()) {
				logger.warn(`[${serial}] Shell setting command returned unexpected output: ${setOutput.trim()}`);
			}
		}

		logger.debug(`[${serial}] All on-device shell settings are good`);
	}

	private async applyOvrPrefs(adb: Adb, serial: string) {
		logger.debug(`[${serial}] Checking on-device OVR preference overrides...`);

		for (const [key, expectedValue] of Object.entries(ON_DEVICE_OVR_PREFS)) {
			const current = await adb.subprocess.noneProtocol
				.spawn(`getprop persist.ovr.prefs_overrides.${key}`)
				.wait()
				.toString();

			logger.trace(`[${serial}] OVR pref '${key}' = '${current.trim()}', expected '${expectedValue}'`);

			if (current.trim() === String(expectedValue)) continue;

			logger.debug(`[${serial}] OVR pref '${key}' isn't correct, fixing it...`);
			await adb.subprocess.noneProtocol
				.spawn(`service call PreferencesService 1 s16 "${key}" i32 ${expectedValue}`)
				.wait();
		}

		logger.debug(`[${serial}] All on-device OVR preference overrides are good`);
	}

	private async applySystemSettings(adb: Adb, serial: string) {
		logger.debug(`[${serial}] Checking on-device system settings...`);
		for (const [key, value] of Object.entries(ON_DEVICE_ADB_SYSTEM_SETTINGS)) {
			if (!(await this.checkSetting(adb, "system", key, value))) {
				logger.debug(`[${serial}] System setting '${key}' isn't correct, fixing it...`);
				await this.setSetting(adb, "system", key, value);
			}
		}
		logger.debug(`[${serial}] All on-device system settings are good`);
	}

	private async applySecureSettings(adb: Adb, serial: string) {
		logger.debug(`[${serial}] Checking on-device secure settings...`);
		for (const [key, value] of Object.entries(ON_DEVICE_ADB_SECURE_SETTINGS)) {
			if (!(await this.checkSetting(adb, "secure", key, value))) {
				logger.debug(`[${serial}] Secure setting '${key}' isn't correct, fixing it...`);
				await this.setSetting(adb, "secure", key, value);
			}
		}
		logger.debug(`[${serial}] All on-device secure settings are good`);
	}

	private async applyBroadcasts(adb: Adb, serial: string) {
		logger.debug(`[${serial}] Sending on-device broadcasts...`);
		for (const action of ON_DEVICE_ADB_BROADCASTS) {
			await adb.subprocess.noneProtocol.spawn(`am broadcast -a ${action}`);
		}
		logger.debug(`[${serial}] All on-device broadcasts sent`);
	}

	private async checkSetting(adb: Adb, namespace: string, param: string, expectedValue: string | number): Promise<boolean> {
		const output = await adb.subprocess.noneProtocol.spawn(`settings get ${namespace} ${param}`).wait().toString();
		const result = output.trim();
		// `settings get` always prints text, while Constants.ts declares most values as numbers
		const expected = String(expectedValue);

		logger.trace(
			`[${adb.serial}] Checking ${namespace} setting '${param}' = ${result}, should be ${expectedValue} (${result === expected})`,
		);

		return result === expected;
	}

	private async setSetting(adb: Adb, namespace: string, param: string, value: string | number) {
		// `settings put` prints nothing on success
		const result = await adb.subprocess.noneProtocol
			.spawn(`settings put ${namespace} ${param} ${value}`)
			.wait()
			.toString();

		logger.trace(`[${adb.serial}] Set ${namespace} setting '${param}' = ${value}: ${result === "" ? "ok" : "failed"}`);

		if (result !== "") {
			logger.error(`[${adb.serial}] Something happened while setting ${namespace} setting '${param}'`);
			logger.error(result);
		}
	}

	//Apps which should not be installed as can create conflict with other things
	private async checkAvoidingApps(adb: Adb, serial: string) {
		const APPS_TO_REMOVE: string[] = ["com.tpn.adbautoenable"];

		for (const packageName of APPS_TO_REMOVE) {
			const isInstalled = await isPackageInstalled(adb, packageName);
			if (isInstalled) {
				logger.warn(`[${serial}] '${packageName}' is installed — removing...`);
				await this.uninstallPackage(adb, serial, packageName);
			}
		}
	}

	private async checkRequiredApps(adb: Adb, serial: string) {
		const REQUIRED_APPS: { packageName: string; apkFile: string; permission: string; needsToStart: boolean }[] = [
			{
				packageName: "tdg.oculuswirelessadb",
				apkFile: "tdg.oculuswirelessadb.apk",
				permission: "android.permission.WRITE_SECURE_SETTINGS",
				needsToStart: false,
			},
			{
				packageName: "eu.project_simple.adbautoenable",
				apkFile: "eu.project_simple.adbautoenable.apk",
				permission: "android.permission.WRITE_SECURE_SETTINGS",
				needsToStart: true,
			},
			{
				packageName: "com.meta.shell.env.footprint.haven2025",
				apkFile: "eu.project_simple.no-loft.apk",
				permission: "",
				needsToStart: false,
			},
		];

		for (const { packageName, apkFile, permission, needsToStart } of REQUIRED_APPS) {
			const targetVersion = await parseApkVersion(apkFile);
			logger.debug(`[${serial}] Checking '${packageName}'${targetVersion ? ` (target: v${targetVersion})` : ""}...`);

			const isInstalled = await isPackageInstalled(adb, packageName);
			// True only when the APK is (re)installed during this run
			let freshlyInstalled = false;

			if (!isInstalled) {
				logger.warn(`[${serial}] '${packageName}' is not installed — installing...`);
				if (!(await this.installApk(adb, serial, resolveToolkitAsset(apkFile)))) continue;
				freshlyInstalled = true;
			} else if (targetVersion) {
				const installedVersion = await getInstalledVersion(adb, packageName);
				if (!installedVersion || compareVersions(installedVersion, targetVersion) < 0) {
					logger.info(
						`[${serial}] '${packageName}' v${installedVersion ?? "?"} → v${targetVersion} — uninstalling first (signature may differ)...`,
					);
					await this.uninstallPackage(adb, serial, packageName);
					if (!(await this.installApk(adb, serial, resolveToolkitAsset(apkFile)))) continue;
					freshlyInstalled = true;
				} else {
					logger.debug(`[${serial}] '${packageName}' is up to date (v${installedVersion})`);
				}
			}

			if (permission !== "") await this.ensurePermission(adb, serial, packageName, permission);

			if (needsToStart && freshlyInstalled) {
				logger.debug(`[${serial}] First time installing '${packageName}', needs to start the application once...`);
				await adb.subprocess.noneProtocol
					.spawn(["monkey", "-p", packageName, "-c", "android.intent.category.LAUNCHER", "1"])
					.wait();
			}
			logger.info(`[${serial}] All good updating '${packageName}' application :)`);
		}
	}

	private async uninstallPackage(adb: Adb, serial: string, packageName: string): Promise<void> {
		const output = await adb.subprocess.noneProtocol.spawn(`pm uninstall ${packageName}`).wait().toString();
		if (!output.trim().includes("Success")) {
			logger.warn(`[${serial}] Uninstall of '${packageName}' returned: ${output.trim()}`);
		}
	}

	private async ensurePermission(adb: Adb, serial: string, packageName: string, permission: string): Promise<void> {
		const output = await adb.subprocess.noneProtocol.spawn(`dumpsys package ${packageName}`).wait().toString();

		if (output.includes(`${permission}: granted=true`)) {
			logger.debug(`[${serial}] '${packageName}' already has ${permission}`);
			return;
		}

		logger.debug(`[${serial}] Granting ${permission} to '${packageName}'...`);
		const grantOutput = await adb.subprocess.noneProtocol
			.spawn(`pm grant ${packageName} ${permission}`)
			.wait()
			.toString();

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
			await pm.installStream(
				apkSize,
				new ReadableStream({
					start: (controller) => {
						controller.enqueue(apkBytes);
						controller.close();
					},
				}),
			);
			logger.info(`[${serial}] Successfully installed APK '${apkPath}'`);
			return true;
		} catch (e) {
			logger.error(`[${serial}] Failed to install APK '${apkPath}': {e}`, { e });
			return false;
		}
	}
}
