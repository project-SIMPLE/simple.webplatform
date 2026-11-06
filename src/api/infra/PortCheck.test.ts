import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { isPortInUse } from "./PortCheck.ts";

let holder: net.Server | undefined;

afterEach(async () => {
	await new Promise<void>((resolve) => (holder ? holder.close(() => resolve()) : resolve()));
	holder = undefined;
});

// Bind an ephemeral port on `host` and keep it open, standing in for another process.
function holdPort(host: string): Promise<number> {
	const server = net.createServer();
	holder = server;
	return new Promise((resolve) => {
		server.listen({ port: 0, host }, () => resolve((server.address() as net.AddressInfo).port));
	});
}

describe("isPortInUse", () => {
	it("reports a port already listened on for the same host", async () => {
		const port = await holdPort("127.0.0.1");
		expect(await isPortInUse(port, "127.0.0.1")).toBe(true);
	});

	it("reports a free port as available, and releases it afterwards", async () => {
		const port = await holdPort("127.0.0.1");
		await new Promise<void>((resolve) => holder?.close(() => resolve()));
		holder = undefined;

		expect(await isPortInUse(port, "127.0.0.1")).toBe(false);
		// The probe must not keep the port: checking again still finds it free
		expect(await isPortInUse(port, "127.0.0.1")).toBe(false);
	});
});
