/**
 * AdbManager.ts
 * ===========
 *
 * Description:
 * It manages Adb sockets :)
 */

import { spawn } from "node:child_process";
import { Adb, AdbServerClient } from "@yume-chan/adb";
import { AdbServerNodeTcpConnector } from "@yume-chan/adb-server-node-tcp";

import Device = AdbServerClient.Device;

import { getLogger } from "@logtape/logtape";
import type Controller from "../../core/Controller.ts";
import { ENV_EXTRA_VERBOSE, ENV_VERBOSE } from "../../index.ts";
import { ScrcpyServer } from "../scrcpy/ScrcpyServer.ts";
import DeviceFinder from "./DeviceFinder.ts";
import { HeadsetSetup } from "./HeadsetSetup.ts";

// Override the log function
const logger = getLogger(["android", "AdbManager"]);

export class AdbManager {
	controller: Controller;
	adbServer!: AdbServerClient;
	videoStreamServer: ScrcpyServer;
	headsetSetup!: HeadsetSetup;
	// Keep list of serial of devices with a stream already starting
	clientCurrentlyStreaming: Device[] = [];
	observer!: AdbServerClient.DeviceObserver; //!: AdbServerClient;
	deviceStatuses: Map<string, string> = new Map();

	constructor(controller: Controller) {
		this.controller = controller;
		try {
			this.adbServer = new AdbServerClient(new AdbServerNodeTcpConnector({ host: "localhost", port: 5037 }));
		} catch (e) {
			logger.error(`Can't connect to device's ADB server ${e}`);
		}
		logger.info("Connect to device's ADB server");

		this.videoStreamServer = new ScrcpyServer(this);
		this.headsetSetup = new HeadsetSetup(this.adbServer);
	}

	/** Start the adb daemon asynchronously (idempotent; returns fast if already running). */
	private startAdbDaemon(): Promise<void> {
		return new Promise((resolve) => {
			const proc = spawn("adb", ["start-server"], { stdio: "ignore" });
			proc.on("close", () => resolve());
			proc.on("error", (e) => {
				logger.error("Failed to start adb daemon: {e}", { e });
				resolve();
			});
		});
	}

	async init() {
		// Ensure the adb daemon is running WITHOUT blocking the event loop. A cold-boot daemon
		// start can take several seconds; spawnSync would freeze the whole process (and the uWS
		// servers) during that time, so use async spawn instead.
		await this.startAdbDaemon();

		// Init watching ADB clients
		this.observer = await this.adbServer.trackDevices();

		const initDeviceList = await this.adbServer.getDevices(["device", "unauthorized", "offline"]);

		if (initDeviceList.length > 0) {
			for (const device of initDeviceList) {
				logger.debug(`Devices found on ADB server: {device}`, { device });

				// Sanitize stale ADB entries on startup (side-effect: disconnects offline ones)
				if (this.isDeviceReady(device)) {
					// Apply M2L2 headset settings only if the device is ready
					this.headsetSetup
						.setupHeadset(device)
						.catch((e) => logger.error(`[${device.serial}] Unexpected error in setupHeadset: {e}`, { e }));
				}
			}

			await this.restartStreamingAll();
		} else {
			logger.debug("No devices found on ADB server...");
		}

		// Set trigger listener for when moving devices
		this.observer.onDeviceAdd((devices) => {
			for (const device of devices) {
				logger.debug("New device added {device}\nStarting streaming for this new device...", { device });
				this.startNewStream(device).catch((e) =>
					logger.error(`[${device.serial}] Unexpected error in startNewStream: {e}`, { e }),
				);
				this.headsetSetup
					.setupHeadset(device)
					.catch((e) => logger.error(`[${device.serial}] Unexpected error in setupHeadset: {e}`, { e }));
			}
		});

		this.observer.onListChange(async (devices) => {
			// Detect "device" → "offline" transitions and disconnect stale entries early
			for (const device of devices) {
				const previousStatus = this.deviceStatuses.get(device.serial);
				if (previousStatus === "device" && device.state === "offline") {
					logger.warn(`[${device.serial}] Device switched to offline`);
					const index = this.clientCurrentlyStreaming.findIndex((d) => d.serial === device.serial);
					if (index > -1) this.clientCurrentlyStreaming.splice(index, 1);
					await this.adbServer.wireless.disconnect(device.serial);
				}
				this.deviceStatuses.set(device.serial, device.state);
			}
			// Clean up statuses for removed devices
			const currentSerials = new Set(devices.map((d) => d.serial));
			for (const serial of this.deviceStatuses.keys()) {
				if (!currentSerials.has(serial)) this.deviceStatuses.delete(serial);
			}

			// Fallback mechanism as the onRemove isn't catching everything...
			// Compare by serial — observer may return different Device instances for the same physical device.
			const activeSerials = new Set(devices.filter((d) => d.state === "device").map((d) => d.serial));
			const disconnected = this.clientCurrentlyStreaming.filter((d) => !activeSerials.has(d.serial));

			if (disconnected.length === 0) return;

			logger.debug("A headset has been disconnected, removing it from the list...");
			for (const device of disconnected) {
				logger.warn(`[${device.serial}] Device disconnected, removing from streaming list`);
				const index = this.clientCurrentlyStreaming.findIndex((d) => d.serial === device.serial);
				if (index > -1) this.clientCurrentlyStreaming.splice(index, 1);

				logger.warn(`[${device.serial}] Trying to reconnect automatically...`);
				const ip: string = device.serial.split(":")[0];
				const df = new DeviceFinder(this);
				let reconnected = false;
				let attempts = 0;

				while (!reconnected) {
					attempts++;
					reconnected = await df.scanAndConnectIP(ip);
					if (!reconnected) {
						logger.debug(`[${ip}] Reconnect attempt ${attempts} failed, retrying in 3s...`);
						await new Promise((resolve) => setTimeout(resolve, 3000));
					}
				}

				logger.info(`[${device.serial}] Successfully reconnected`);
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
		if (!this.isDeviceReady(device)) {
			logger.debug(`[${device.serial}] Not ready to interact with ADB. Skipping...`)
			return;
		}

		// Ensure having only one streaming per device — compare by serial, not reference
		if (this.clientCurrentlyStreaming.some((d) => d.serial === device.serial)) {
			logger.debug(`[${device.serial}] Already streaming. Skipping...`);
			return;
		}

		// Add new device streaming
		this.clientCurrentlyStreaming.push(device);

		try {
			const transport = await this.adbServer.createTransport(device);
			const adb = new Adb(transport);
			const model = device.model ?? "Unknown";

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
			if (errorMsg.toLowerCase().includes("unauthorized")) {
				logger.error(
					`[${device.serial}] Device is not authorized for ADB — accept the RSA key prompt on the device then reconnect`,
				);
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
			await new Promise((resolve) => setTimeout(resolve, 2000));
		}
	}

	isDeviceReady(device: Device): boolean {
		let isReady = false;


		if (device.serial.endsWith("._adb-tls-connect._tcp"))
			logger.debug(`[${device.serial}] Not a real device. Skipping...`);
		else switch (device.state) {
			case "device":
				isReady = true;
				break;

			case "offline":
				logger.warn(`[${device.serial}] Device is offline, disconnecting stale entry...`);
				void this.disconnectDevice(device.serial);
				break;

			case "unauthorized":
				logger.error(
					`[${device.serial}] Device is not authorized — You need to manually pair the headset with this computer (accept the RSA key prompt on the device)`,
				);
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
				await adb.subprocess.noneProtocol.spawn("reboot -p");
				logger.info(`[${device.serial}] Power-off command sent`);
			} catch (e) {
				logger.warn(`[${device.serial}] Failed to send power-off command: {e}`, { e });
			}
		}
	}

	async disconnectDevice(serial: string): Promise<void> {
		const index = this.clientCurrentlyStreaming.findIndex((d) => d.serial === serial);
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
				await this.adbServer.wireless.connect(`${ip}:${port}`);
				success = true;
			} catch (e) {
				if (ENV_EXTRA_VERBOSE) logger.error(`Couldn't connect with this error message ${e}`);
			}
		}

		return success;
	}
}
