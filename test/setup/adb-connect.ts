import { Adb, AdbServerClient } from "@yume-chan/adb";
import { AdbServerNodeTcpConnector } from "@yume-chan/adb-server-node-tcp";
import { firstReadyDevice } from "./adb-probe.ts";

export type AdbDevice = Awaited<ReturnType<AdbServerClient["getDevices"]>>[number];

export interface AdbConnection {
	server: AdbServerClient;
	device: AdbDevice;
	adb: Adb;
}

/**
 * Open an Adb transport to the first ready device on the local adb server
 * (localhost:5037) — the same server AdbManager connects to. Throws if no
 * device is attached; callers gate on the adb-probe first.
 */
export async function connectFirstDevice(): Promise<AdbConnection> {
	const serial = firstReadyDevice();
	if (!serial) throw new Error("No ready adb device on localhost:5037");

	const server = new AdbServerClient(new AdbServerNodeTcpConnector({ host: "localhost", port: 5037 }));
	const device = (await server.getDevices(["device"])).find((d) => d.serial === serial);
	if (!device) throw new Error(`Device ${serial} not found on the adb server`);

	const adb = new Adb(await server.createTransport(device));
	return { server, device, adb };
}
