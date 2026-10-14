import { spawnSync } from "node:child_process";

export interface AdbDevice {
	serial: string;
	state: string;
}

/**
 * List devices known to the local adb server via the `adb` CLI. Returns [] when
 * adb is missing or the command fails — so the ADB integration suite can skip
 * itself when there is no device/emulator attached.
 *
 * Running `adb devices` also starts the adb server on localhost:5037, which is
 * the endpoint AdbManager (and the tests) connect to.
 */
export function listAdbDevices(): AdbDevice[] {
	try {
		const res = spawnSync("adb", ["devices"], { encoding: "utf-8", timeout: 15_000 });
		if (res.status !== 0 || !res.stdout) return [];
		return res.stdout
			.split("\n")
			.slice(1) // drop the "List of devices attached" header
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => {
				const [serial, state] = line.split(/\s+/);
				return { serial, state };
			})
			.filter((d) => d.serial && d.state);
	} catch {
		return [];
	}
}

/**
 * True for the mDNS entry (`adb-<serial>-<id>._adb-tls-connect._tcp`) that adb lists
 * next to a wirelessly paired device. The platform ignores those (AdbManager.isDeviceReady).
 */
export function isMdnsSerial(serial: string): boolean {
	return serial.includes("._adb-tls-connect._tcp");
}

/**
 * Serial of the first device in the "device" (ready) state, or null. A device the
 * platform would actually use is preferred over its mDNS twin, which is only
 * returned when nothing else is attached.
 */
export function firstReadyDevice(): string | null {
	const ready = listAdbDevices().filter((d) => d.state === "device");
	return (ready.find((d) => !isMdnsSerial(d.serial)) ?? ready[0])?.serial ?? null;
}

/** True when at least one adb device/emulator is attached and ready. */
export function isAdbDeviceReady(): boolean {
	return firstReadyDevice() !== null;
}
