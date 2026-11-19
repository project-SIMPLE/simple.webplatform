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
 *
 * With no server the connection is refused at once, so the timeout only runs when
 * something listens but is slow to accept: a GAMA busy with a load, as on the
 * macOS CI runners, where the former 2 s made whole test files skip (2026-11-17).
 */
export function isGamaReachable(timeoutMs = 10_000): Promise<boolean> {
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
			// No family pin — see the matching note in GamaConnector.connectGama():
			// GAMA on Windows listens on IPv6 only, on Linux dual-stack, so the
			// probe must let Node try both families like the connector does.
			ws = new WebSocket(gamaUrl());
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
