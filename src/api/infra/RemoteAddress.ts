import type { HttpRequest, HttpResponse, us_socket_context_t } from "uWebSockets.js";
import { getLogger, type Logger } from "@logtape/logtape";

const logger: Logger = getLogger(["infra", "RemoteAddress"]);

/**
 * Per-socket user data carrying the peer address captured at upgrade time.
 * Read it with `ws.getUserData().ip`.
 */
export interface RemoteAddressData {
	ip: string;
}

// Prefix uWS uses for an IPv4 peer on a dual-stack socket, e.g.
// "0000:0000:0000:0000:0000:ffff:c0a8:4466" for 192.168.68.102.
const IPV4_MAPPED_HEX = /^(?:0{1,4}:){5}ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i;
// Compressed form some stacks produce, e.g. "::ffff:192.168.68.102".
const IPV4_MAPPED_DOTTED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

/**
 * Turns the text uWS returns for a peer address into a stable, readable key.
 * IPv4-mapped IPv6 addresses become plain dotted IPv4; anything else is
 * returned trimmed and lower-cased.
 */
export function normalizeRemoteAddress(text: string): string {
	const address = text.trim().toLowerCase();

	const hex = IPV4_MAPPED_HEX.exec(address);
	if (hex) {
		const high = Number.parseInt(hex[1], 16);
		const low = Number.parseInt(hex[2], 16);
		return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
	}

	const dotted = IPV4_MAPPED_DOTTED.exec(address);
	if (dotted) return dotted[1];

	return address;
}

let unknownPeerCounter = 0;

/**
 * Resolves the peer address of an HTTP request about to be upgraded.
 *
 * `ws.getRemoteAddressAsText()` returns an empty string inside the `open`,
 * `message` and `close` handlers (observed with uWebSockets.js v20.67.0), so
 * the address must be read from the HttpResponse during `upgrade`. If even
 * that comes back empty, a unique placeholder is returned: an empty key would
 * merge every client into one entry, which is worse than losing
 * reconnect-by-address for that client.
 */
export function resolveRemoteAddress(res: HttpResponse): string {
	const ip = normalizeRemoteAddress(Buffer.from(res.getRemoteAddressAsText()).toString());
	if (ip !== "") return ip;

	unknownPeerCounter += 1;
	const placeholder = `unknown-peer-${unknownPeerCounter}`;
	logger.error(`Could not read the remote address of an incoming WebSocket, using ${placeholder} instead`);
	return placeholder;
}

/**
 * Drop-in `upgrade` handler for `uWS.App().ws<RemoteAddressData>()` that
 * stores the peer address in the socket's user data.
 */
export function upgradeWithRemoteAddress(res: HttpResponse, req: HttpRequest, context: us_socket_context_t): void {
	res.upgrade<RemoteAddressData>(
		{ ip: resolveRemoteAddress(res) },
		req.getHeader("sec-websocket-key"),
		req.getHeader("sec-websocket-protocol"),
		req.getHeader("sec-websocket-extensions"),
		context,
	);
}
