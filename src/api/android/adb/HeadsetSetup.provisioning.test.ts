import { statSync } from "node:fs";
import type { Adb, AdbServerClient } from "@yume-chan/adb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	ON_DEVICE_ADB_GLOBAL_SETTINGS,
	ON_DEVICE_ADB_SECURE_SETTINGS,
	ON_DEVICE_ADB_SYSTEM_SETTINGS,
} from "../../core/Constants.ts";
import { resolveToolkitAsset } from "../../infra/ToolkitAssets.ts";

// Offline counterpart of test/adb/headset-setup.test.ts. The real HeadsetSetup runs
// against a small in-memory headset that answers the adb shell commands the way
// Android does (`settings`, `pm`, `dumpsys`, `monkey`). It covers what a device
// test cannot observe: which commands were sent, and that nothing is rewritten or
// relaunched when the headset is already in the right state.

// APK installs go through the library's PackageManager; route them to the headset.
vi.mock("@yume-chan/android-bin", () => ({
	PackageManager: class {
		constructor(private readonly adb: { installApkOfSize(size: number): void }) {}
		async installStream(size: number, stream: ReadableStream<Uint8Array>) {
			for await (const _ of stream as unknown as AsyncIterable<Uint8Array>) {
				/* drain, as a real install would */
			}
			this.adb.installApkOfSize(Number(size));
		}
	},
}));

import { HeadsetSetup } from "./HeadsetSetup.ts";

const WRITE_SECURE = "android.permission.WRITE_SECURE_SETTINGS";

// The three APKs HeadsetSetup ships, with the version read from their manifest.
const APKS = [
	{ file: "tdg.oculuswirelessadb.apk", pkg: "tdg.oculuswirelessadb", version: "1.3" },
	{ file: "eu.project_simple.adbautoenable.apk", pkg: "eu.project_simple.adbautoenable", version: "3.0.0" },
	{ file: "eu.project_simple.no-loft.apk", pkg: "com.meta.shell.env.footprint.haven2025", version: "999.9.9.9.99" },
].map((apk) => ({ ...apk, size: statSync(resolveToolkitAsset(apk.file)).size }));

interface InstalledPackage {
	version: string;
	granted: Set<string>;
}

class FakeHeadset {
	readonly serial = "192.168.68.10:5555";
	readonly settings = new Map<string, string>();
	readonly packages = new Map<string, InstalledPackage>();
	readonly commands: string[] = [];

	readonly subprocess = {
		noneProtocol: {
			spawn: (command: string | readonly string[]) => {
				const line = typeof command === "string" ? command : command.join(" ");
				this.commands.push(line);
				const output = this.run(line.split(" "));
				return { wait: () => ({ toString: async () => output }) };
			},
		},
	};

	installApkOfSize(size: number) {
		const apk = APKS.find((a) => a.size === size);
		if (!apk) throw new Error(`unknown APK of ${size} bytes`);
		this.packages.set(apk.pkg, { version: apk.version, granted: new Set() });
	}

	sent(prefix: string): string[] {
		return this.commands.filter((c) => c.startsWith(prefix));
	}

	private run(args: string[]): string {
		const [bin, verb, ...rest] = args;
		if (bin === "settings" && verb === "get") {
			// Android prints the literal "null" for an unset key.
			return `${this.settings.get(`${rest[0]}/${rest[1]}`) ?? "null"}\n`;
		}
		if (bin === "settings" && verb === "put") {
			this.settings.set(`${rest[0]}/${rest[1]}`, rest.slice(2).join(" "));
			return "";
		}
		if (bin === "pm" && verb === "list") {
			return [...this.packages.keys()]
				.filter((name) => name.includes(rest[1]))
				.map((name) => `package:${name}\n`)
				.join("");
		}
		if (bin === "pm" && verb === "uninstall") {
			return this.packages.delete(rest[0]) ? "Success\n" : "Failure [DELETE_FAILED_INTERNAL_ERROR]\n";
		}
		if (bin === "pm" && verb === "grant") {
			this.packages.get(rest[0])?.granted.add(rest[1]);
			return "";
		}
		if (bin === "dumpsys" && verb === "package") {
			const pkg = this.packages.get(rest[0]);
			if (!pkg) return `Unable to find package: ${rest[0]}\n`;
			const perms = [...pkg.granted].map((p) => `      ${p}: granted=true\n`).join("");
			return `Packages:\n  Package [${rest[0]}]\n    versionName=${pkg.version}\n    runtime permissions:\n${perms}`;
		}
		if (bin === "monkey") return "Events injected: 1\n";
		throw new Error(`FakeHeadset: unsupported command '${args.join(" ")}'`);
	}
}

type Provisioning = {
	applyGlobalSettings(adb: Adb, serial: string): Promise<void>;
	applySystemSettings(adb: Adb, serial: string): Promise<void>;
	applySecureSettings(adb: Adb, serial: string): Promise<void>;
	checkRequiredApps(adb: Adb, serial: string): Promise<void>;
};

let headset: FakeHeadset;
let adb: Adb;
const setup = new HeadsetSetup({} as AdbServerClient) as unknown as Provisioning;

const ALL_SETTINGS = [
	["global", ON_DEVICE_ADB_GLOBAL_SETTINGS],
	["system", ON_DEVICE_ADB_SYSTEM_SETTINGS],
	["secure", ON_DEVICE_ADB_SECURE_SETTINGS],
] as const;

async function applyAllSettings() {
	await setup.applyGlobalSettings(adb, headset.serial);
	await setup.applySystemSettings(adb, headset.serial);
	await setup.applySecureSettings(adb, headset.serial);
}

beforeEach(() => {
	headset = new FakeHeadset();
	adb = headset as unknown as Adb;
});

describe("HeadsetSetup settings", () => {
	it("writes every configured setting on a factory-fresh headset", async () => {
		await applyAllSettings();

		for (const [namespace, table] of ALL_SETTINGS) {
			for (const [key, value] of Object.entries(table)) {
				expect(headset.settings.get(`${namespace}/${key}`), `${namespace}/${key}`).toBe(String(value));
			}
		}
	});

	// Constants.ts declares most values as numbers while `settings get` prints text:
	// compared strictly, every numeric setting was rewritten on each start and then
	// reported as "couldn't properly set".
	it("leaves an already-configured headset alone", async () => {
		await applyAllSettings();
		headset.commands.length = 0;

		await applyAllSettings();

		expect(headset.sent("settings put")).toEqual([]);
		expect(headset.sent("settings get").length).toBeGreaterThan(0);
	});

	it("rewrites only the setting that drifted", async () => {
		await applyAllSettings();
		headset.settings.set("global/stay_on_while_plugged_in", "0");
		headset.commands.length = 0;

		await applyAllSettings();

		expect(headset.sent("settings put")).toEqual([
			`settings put global stay_on_while_plugged_in ${ON_DEVICE_ADB_GLOBAL_SETTINGS.stay_on_while_plugged_in}`,
		]);
	});
});

describe("HeadsetSetup required apps", () => {
	const autoEnable = "eu.project_simple.adbautoenable";
	const launches = () => headset.sent("monkey");

	function preinstall(overrides: Record<string, string> = {}) {
		for (const apk of APKS) {
			headset.packages.set(apk.pkg, {
				version: overrides[apk.pkg] ?? apk.version,
				granted: new Set([WRITE_SECURE]),
			});
		}
	}

	it("installs the three apps on a fresh headset, grants their permission and starts adbautoenable once", async () => {
		await setup.checkRequiredApps(adb, headset.serial);

		for (const apk of APKS) expect(headset.packages.get(apk.pkg)?.version, apk.pkg).toBe(apk.version);
		expect(headset.packages.get("tdg.oculuswirelessadb")?.granted.has(WRITE_SECURE)).toBe(true);
		expect(headset.packages.get(autoEnable)?.granted.has(WRITE_SECURE)).toBe(true);
		// Only adbautoenable needs a first launch to finish initialising.
		expect(launches()).toEqual([`monkey -p ${autoEnable} -c android.intent.category.LAUNCHER 1`]);
	});

	// It used to be launched on every platform start, popping the app up on the
	// headset each time.
	it("installs nothing and launches nothing when every app is up to date", async () => {
		preinstall();

		await setup.checkRequiredApps(adb, headset.serial);

		expect(launches()).toEqual([]);
		expect(headset.sent("pm uninstall")).toEqual([]);
		expect(headset.sent("pm grant")).toEqual([]);
	});

	it("replaces an outdated adbautoenable and starts the new one", async () => {
		preinstall({ [autoEnable]: "2.9.0" });

		await setup.checkRequiredApps(adb, headset.serial);

		expect(headset.sent("pm uninstall")).toEqual([`pm uninstall ${autoEnable}`]);
		expect(headset.packages.get(autoEnable)?.version).toBe("3.0.0");
		expect(launches()).toHaveLength(1);
	});

	it("never downgrades a newer app", async () => {
		preinstall({ [autoEnable]: "4.0.0" });

		await setup.checkRequiredApps(adb, headset.serial);

		expect(headset.packages.get(autoEnable)?.version).toBe("4.0.0");
		expect(launches()).toEqual([]);
	});

	it("grants a missing permission to an app that is otherwise up to date, without relaunching it", async () => {
		preinstall();
		headset.packages.get(autoEnable)?.granted.clear();

		await setup.checkRequiredApps(adb, headset.serial);

		expect(headset.sent("pm grant")).toEqual([`pm grant ${autoEnable} ${WRITE_SECURE}`]);
		expect(launches()).toEqual([]);
	});
});
