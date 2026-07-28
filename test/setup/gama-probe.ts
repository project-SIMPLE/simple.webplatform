import WebSocket from "ws";

/** GAMA server the integration suite targets. Mirrors GamaConnector.connectGama defaults. */
export function gamaUrl(): string {
	const ip = process.env.GAMA_IP_ADDRESS || "localhost";
	const port = process.env.GAMA_WS_PORT || "1000";
	return `ws://${ip}:${port}`;
}

/**
 * Probe whether a GAMA WebSocket server is up and accepting connections.
 * Resolves true on a successful open, false on any error/timeout — so the
 * integration suite can skip itself offline instead of failing.
 */
export function isGamaReachable(timeoutMs = 2000): Promise<boolean> {
	return new Promise((resolve) => {
		let settled = false;
		const done = (ok: boolean, socket?: WebSocket) => {
			if (settled) return;
			settled = true;
			try {
				socket?.close();
			} catch {
				/* ignore */
			}
			resolve(ok);
		};

		let ws: WebSocket;
		try {
			// family: 4 — see the matching note in GamaConnector.connectGama(). Without
			// it, a hung IPv6 "localhost" attempt can outlast this probe's own timeout
			// and falsely report GAMA as unreachable even though it is up on IPv4.
			ws = new WebSocket(gamaUrl(), { family: 4 });
		} catch {
			resolve(false);
			return;
		}

		const timer = setTimeout(() => done(false, ws), timeoutMs);
		ws.on("open", () => {
			clearTimeout(timer);
			done(true, ws);
		});
		ws.on("error", () => {
			clearTimeout(timer);
			done(false, ws);
		});
	});
}
