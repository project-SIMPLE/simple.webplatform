import WebSocket from "ws";

type Json = Record<string, unknown>;
type Predicate = (msg: Json) => boolean;

export interface TestClient {
	socket: WebSocket;
	/** Resolve once the socket is OPEN (or reject on error). */
	waitOpen(): Promise<void>;
	/** Send a JSON message. */
	send(obj: unknown): void;
	/** Resolve with the first (buffered or future) message matching `predicate`. */
	waitFor(predicate: Predicate, timeoutMs?: number): Promise<Json>;
	/** Close the socket and resolve once closed. */
	close(): Promise<void>;
}

/**
 * A minimal real WebSocket client for the socket integration tests. Buffers every
 * message and lets a test await the first one matching a predicate, so unrelated
 * traffic (e.g. heartbeat pings) never breaks an assertion.
 */
export function openClient(url: string): TestClient {
	const socket = new WebSocket(url);
	const buffer: Json[] = [];
	const waiters: { predicate: Predicate; resolve: (m: Json) => void }[] = [];

	socket.on("message", (data) => {
		let msg: Json;
		try {
			msg = JSON.parse(data.toString());
		} catch {
			msg = { raw: data.toString() };
		}
		const i = waiters.findIndex((w) => w.predicate(msg));
		if (i >= 0) {
			const [w] = waiters.splice(i, 1);
			w.resolve(msg);
		} else {
			buffer.push(msg);
		}
	});

	return {
		socket,
		waitOpen: () =>
			new Promise((resolve, reject) => {
				if (socket.readyState === WebSocket.OPEN) return resolve();
				socket.once("open", () => resolve());
				socket.once("error", reject);
			}),
		send: (obj) => socket.send(JSON.stringify(obj)),
		waitFor: (predicate, timeoutMs = 3000) =>
			new Promise((resolve, reject) => {
				const idx = buffer.findIndex(predicate);
				if (idx >= 0) {
					const [m] = buffer.splice(idx, 1);
					return resolve(m);
				}
				const waiter = {
					predicate,
					resolve: (m: Json) => {
						clearTimeout(timer);
						resolve(m);
					},
				};
				const timer = setTimeout(() => {
					const wi = waiters.indexOf(waiter);
					if (wi >= 0) waiters.splice(wi, 1);
					reject(new Error("waitFor timed out"));
				}, timeoutMs);
				waiters.push(waiter);
			}),
		close: () =>
			new Promise((resolve) => {
				if (socket.readyState === WebSocket.CLOSED) return resolve();
				socket.once("close", () => resolve());
				socket.close();
			}),
	};
}
