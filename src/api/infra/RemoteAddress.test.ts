import type { HttpRequest, HttpResponse, us_socket_context_t } from "uWebSockets.js";
import { describe, expect, it, vi } from "vitest";
import { normalizeRemoteAddress, resolveRemoteAddress, upgradeWithRemoteAddress } from "./RemoteAddress.ts";

// A HttpResponse stub whose getRemoteAddressAsText() returns `text`, as uWS does
// (an ArrayBuffer of the textual address).
function fakeResponse(text: string) {
	return {
		getRemoteAddressAsText: () => new TextEncoder().encode(text).buffer,
		upgrade: vi.fn(),
	} as unknown as HttpResponse & { upgrade: ReturnType<typeof vi.fn> };
}

describe("normalizeRemoteAddress", () => {
	it.each([
		// The format uWS returns for an IPv4 peer on its dual-stack listener
		["0000:0000:0000:0000:0000:ffff:c0a8:4466", "192.168.68.102"],
		["0000:0000:0000:0000:0000:ffff:7f00:0001", "127.0.0.1"],
		["0000:0000:0000:0000:0000:FFFF:0A00:0001", "10.0.0.1"],
		["::ffff:192.168.68.103", "192.168.68.103"],
		["192.168.68.104", "192.168.68.104"],
		["  192.168.68.105\n", "192.168.68.105"],
	])("maps %j to %j", (input, expected) => {
		expect(normalizeRemoteAddress(input)).toBe(expected);
	});

	it("keeps a genuine IPv6 address as-is (lower-cased)", () => {
		expect(normalizeRemoteAddress("0000:0000:0000:0000:0000:0000:0000:0001")).toBe(
			"0000:0000:0000:0000:0000:0000:0000:0001",
		);
		expect(normalizeRemoteAddress("FE80:0000:0000:0000:0000:0000:0000:0001")).toBe(
			"fe80:0000:0000:0000:0000:0000:0000:0001",
		);
	});

	it("gives distinct headsets distinct keys", () => {
		const keys = ["c0a8:4465", "c0a8:4466", "c0a8:4467"].map((tail) =>
			normalizeRemoteAddress(`0000:0000:0000:0000:0000:ffff:${tail}`),
		);
		expect(new Set(keys).size).toBe(3);
	});
});

// Regression: with uWebSockets.js v20.67.0, ws.getRemoteAddressAsText() is empty
// in open/message/close. Every headset was keyed by "", so only the first one
// could join a GAMA session. A peer must never resolve to an empty key.
describe("resolveRemoteAddress", () => {
	it("returns the normalized address of the request", () => {
		expect(resolveRemoteAddress(fakeResponse("0000:0000:0000:0000:0000:ffff:c0a8:4466"))).toBe("192.168.68.102");
	});

	it("never returns an empty key, and never the same placeholder twice", () => {
		const first = resolveRemoteAddress(fakeResponse(""));
		const second = resolveRemoteAddress(fakeResponse("   "));
		expect(first).not.toBe("");
		expect(second).not.toBe("");
		expect(first).not.toBe(second);
	});
});

describe("upgradeWithRemoteAddress", () => {
	it("upgrades with the peer address in the user data and forwards the handshake headers", () => {
		const res = fakeResponse("0000:0000:0000:0000:0000:ffff:c0a8:4467");
		const headers: Record<string, string> = {
			"sec-websocket-key": "key",
			"sec-websocket-protocol": "proto",
			"sec-websocket-extensions": "ext",
		};
		const req = { getHeader: (name: string) => headers[name] ?? "" } as unknown as HttpRequest;
		const context = {} as us_socket_context_t;

		upgradeWithRemoteAddress(res, req, context);

		expect(res.upgrade).toHaveBeenCalledWith({ ip: "192.168.68.103" }, "key", "proto", "ext", context);
	});
});
