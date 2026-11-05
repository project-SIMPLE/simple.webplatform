import net from "node:net";

/** How a test client reaches a local server from a given source address. */
export interface LoopbackSource {
	/** Host to put in the client URL. */
	host: string;
	/** Source address to bind the client socket to (undefined = OS default). */
	localAddress?: string;
	/** Key the server is expected to derive for this client, when predictable. */
	expectedKey?: string;
}

function canBind(address: string): Promise<boolean> {
	return new Promise((resolve) => {
		const srv = net.createServer();
		srv.once("error", () => resolve(false));
		srv.listen(0, address, () => srv.close(() => resolve(true)));
	});
}

/**
 * Two loopback sources the server sees as different peers, to simulate two
 * headsets on different IPs without real hardware.
 *
 * Linux and Windows route the whole 127.0.0.0/8 block to loopback, so a client
 * can bind 127.0.0.2. macOS only configures 127.0.0.1 on lo0, so the second
 * peer falls back to the IPv6 loopback ::1.
 */
export async function twoLoopbackSources(): Promise<[LoopbackSource, LoopbackSource]> {
	const first: LoopbackSource = { host: "127.0.0.1", localAddress: "127.0.0.1", expectedKey: "127.0.0.1" };

	if (await canBind("127.0.0.2")) {
		return [first, { host: "127.0.0.1", localAddress: "127.0.0.2", expectedKey: "127.0.0.2" }];
	}
	if (await canBind("::1")) {
		return [first, { host: "[::1]" }];
	}
	throw new Error("No second loopback address available (neither 127.0.0.2 nor ::1 can be bound)");
}
