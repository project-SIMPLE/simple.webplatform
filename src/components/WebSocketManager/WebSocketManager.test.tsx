import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WsWebSocket, { WebSocketServer } from "ws";
import type { Controller } from "../../api/core/Controller.ts";
import { MonitorServer } from "../../api/monitoring/MonitorServer.ts";
import WebSocketManager, {
	INITIAL_CONNECT_TIMEOUT_MS,
	isFirefox,
	MAX_CONNECT_TIMEOUT_MS,
	useWebSocket,
} from "./WebSocketManager.tsx";

// Must match FRONTEND_MONITOR_WS_PORT in vitest.config.ts (a build-time define,
// so WebSocketManager connects to exactly this port).
const PORT = 8991;

const GAMA = {
	connected: true,
	loading: false,
	experiment_state: "NONE",
	experiment_id: "",
	experiment_name: "",
	content_error: "",
};
const PLAYERS = { p1: { id: "p1", connected: true, in_game: false, date_connection: "10:00" } };

// Minimal real backend wiring: MonitorServer sends json_state (real gama + players)
// + settings to a monitor on connect.
function backendController(): Controller {
	return {
		model_manager: { getActiveModel: () => ({ getJsonSettings: () => ({ type: "json_settings", name: "Demo" }) }) },
		gama_connector: { getJsonGama: () => GAMA },
		player_manager: { getArrayPlayerList: () => PLAYERS },
	} as unknown as Controller;
}

function Probe() {
	const { isWsConnected, gamaless, gama, playerList } = useWebSocket();
	return (
		<div>
			<span data-testid="conn">{String(isWsConnected)}</span>
			<span data-testid="gamaless">{String(gamaless)}</span>
			<span data-testid="gama-connected">{String(gama.connected)}</span>
			<span data-testid="players">{Object.keys(playerList).join(",")}</span>
		</div>
	);
}

describe("WebSocketManager against a real MonitorServer", () => {
	let server: MonitorServer | undefined;
	const realWebSocket = globalThis.WebSocket;

	beforeEach(() => {
		process.env.MONITOR_WS_PORT = String(PORT);
		globalThis.WebSocket = WsWebSocket as unknown as typeof globalThis.WebSocket;
		server = new MonitorServer(backendController());
	});

	afterEach(() => {
		cleanup();
		try {
			server?.close();
		} catch {
			/* already closed */
		}
		server = undefined;
		globalThis.WebSocket = realWebSocket;
	});

	it("connects and hydrates context from the backend's json_state", async () => {
		render(
			<WebSocketManager>
				<Probe />
			</WebSocketManager>,
		);

		await waitFor(() => expect(screen.getByTestId("conn").textContent).toBe("true"), { timeout: 5000 });
		expect(screen.getByTestId("gama-connected").textContent).toBe("true");
		expect(screen.getByTestId("gamaless").textContent).toBe("false");
		expect(screen.getByTestId("players").textContent).toBe("p1");
	});

	it("flips isWsConnected to false when the backend goes away", async () => {
		render(
			<WebSocketManager>
				<Probe />
			</WebSocketManager>,
		);
		await waitFor(() => expect(screen.getByTestId("conn").textContent).toBe("true"), { timeout: 5000 });

		server?.close();
		server = undefined;

		await waitFor(() => expect(screen.getByTestId("conn").textContent).toBe("false"), { timeout: 5000 });
	});
});

// A socket that stays CONNECTING until told otherwise — what Firefox exposes while it throttles
// reconnects to a host that kept failing. close() fires onclose like a real aborted socket.
class StalledWebSocket {
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSED = 3;
	static instances: StalledWebSocket[] = [];
	readyState = StalledWebSocket.CONNECTING;
	closedAt: number | null = null;
	onopen: (() => void) | null = null;
	onclose: (() => void) | null = null;
	onerror: (() => void) | null = null;
	onmessage: ((e: MessageEvent) => void) | null = null;
	readonly createdAt = Date.now();

	constructor(readonly url: string) {
		StalledWebSocket.instances.push(this);
	}
	open() {
		this.readyState = StalledWebSocket.OPEN;
		this.onopen?.();
	}
	close() {
		if (this.readyState === StalledWebSocket.CLOSED) return;
		this.readyState = StalledWebSocket.CLOSED;
		this.closedAt = Date.now();
		this.onclose?.();
	}
}

const UA = {
	firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:158.0) Gecko/20100101 Firefox/158.0",
	chrome:
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
	edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0",
	safari:
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
};

describe("isFirefox", () => {
	it("only matches Firefox", () => {
		expect(isFirefox(UA.firefox)).toBe(true);
		expect(isFirefox(UA.chrome)).toBe(false);
		expect(isFirefox(UA.edge)).toBe(false);
		expect(isFirefox(UA.safari)).toBe(false);
	});
});

describe("WebSocketManager stalled-connection retries", () => {
	const realWebSocket = globalThis.WebSocket;

	beforeEach(() => {
		vi.useFakeTimers();
		StalledWebSocket.instances = [];
		globalThis.WebSocket = StalledWebSocket as unknown as typeof globalThis.WebSocket;
		vi.spyOn(navigator, "userAgent", "get").mockReturnValue(UA.firefox);
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		vi.restoreAllMocks();
		globalThis.WebSocket = realWebSocket;
	});

	// How long each socket stayed CONNECTING before being aborted
	const abortDelays = () =>
		StalledWebSocket.instances.filter((s) => s.closedAt !== null).map((s) => (s.closedAt ?? 0) - s.createdAt);

	it.each([
		["Chrome", UA.chrome],
		["Edge", UA.edge],
		["Safari", UA.safari],
	])("keeps a fixed connect timeout on %s", async (_name, userAgent) => {
		vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
		render(
			<WebSocketManager>
				<Probe />
			</WebSocketManager>,
		);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(60_000);
		});

		const delays = abortDelays();
		expect(delays.length).toBeGreaterThan(5);
		expect(new Set(delays)).toEqual(new Set([INITIAL_CONNECT_TIMEOUT_MS]));
	});

	it("on Firefox, doubles the connect timeout after each stalled attempt, capped past its 60s throttle", async () => {
		render(
			<WebSocketManager>
				<Probe />
			</WebSocketManager>,
		);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(10 * 60_000);
		});

		expect(MAX_CONNECT_TIMEOUT_MS).toBeGreaterThan(60_000);
		expect(abortDelays().slice(0, 7)).toEqual([
			3000,
			6000,
			12000,
			24000,
			48000,
			MAX_CONNECT_TIMEOUT_MS,
			MAX_CONNECT_TIMEOUT_MS,
		]);
	});

	it("on Firefox, resets to the initial timeout once a connection succeeds", async () => {
		render(
			<WebSocketManager>
				<Probe />
			</WebSocketManager>,
		);
		// Two stalled attempts (3s, then 6s), then the third one connects
		await act(async () => {
			await vi.advanceTimersByTimeAsync(INITIAL_CONNECT_TIMEOUT_MS + 1000 + 2 * INITIAL_CONNECT_TIMEOUT_MS + 1000);
		});
		expect(StalledWebSocket.instances).toHaveLength(3);
		act(() => StalledWebSocket.instances[2].open());
		expect(screen.getByTestId("conn").textContent).toBe("true");

		// The backend drops; the next attempt stalls and must be aborted after the INITIAL timeout again
		act(() => StalledWebSocket.instances[2].close());
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1000 + INITIAL_CONNECT_TIMEOUT_MS);
		});
		expect(abortDelays().at(-1)).toBe(INITIAL_CONNECT_TIMEOUT_MS);
	});
});

// Fault-inject the frontend parser with a raw ws server (a frame source, not the
// real backend) to prove handleMessage's resilience. NB: a json_state that omits
// `player` sets playerList to undefined — a fragility documented in
// test/chaos-findings.md, not exercised here (it would crash consumers).
function ChaosProbe() {
	const { isWsConnected, gamaless, gama, simulationList } = useWebSocket();
	return (
		<div>
			<span data-testid="conn">{String(isWsConnected)}</span>
			<span data-testid="gamaless">{String(gamaless)}</span>
			<span data-testid="gama-connected">{String(gama.connected)}</span>
			<span data-testid="sims">{simulationList.length}</span>
		</div>
	);
}

describe("WebSocketManager chaos — malformed frames", () => {
	let wss: WebSocketServer | undefined;
	const realWebSocket = globalThis.WebSocket;

	function serve(firstFrame: string) {
		wss = new WebSocketServer({ host: "127.0.0.1", port: PORT });
		wss.on("connection", (ws) => ws.send(firstFrame));
	}

	beforeEach(() => {
		process.env.MONITOR_WS_PORT = String(PORT);
		globalThis.WebSocket = WsWebSocket as unknown as typeof globalThis.WebSocket;
	});

	afterEach(async () => {
		cleanup();
		await new Promise<void>((resolve) => (wss ? wss.close(() => resolve()) : resolve()));
		wss = undefined;
		globalThis.WebSocket = realWebSocket;
	});

	it("survives a non-JSON frame without dropping the connection", async () => {
		serve("this is not json {{{");
		render(
			<WebSocketManager>
				<ChaosProbe />
			</WebSocketManager>,
		);
		await waitFor(() => expect(screen.getByTestId("conn").textContent).toBe("true"), { timeout: 5000 });
		expect(screen.getByTestId("sims").textContent).toBe("0"); // garbage ignored
	});

	it("flips gamaless when json_state carries an empty gama", async () => {
		serve(JSON.stringify({ type: "json_state", gama: {}, player: {} }));
		render(
			<WebSocketManager>
				<ChaosProbe />
			</WebSocketManager>,
		);
		await waitFor(() => expect(screen.getByTestId("gamaless").textContent).toBe("true"), { timeout: 5000 });
	});

	it("decodes a double-encoded simulation list", async () => {
		const list = [{ type: "json_settings", name: "A" }];
		serve(JSON.stringify(JSON.stringify(list)));
		render(
			<WebSocketManager>
				<ChaosProbe />
			</WebSocketManager>,
		);
		await waitFor(() => expect(screen.getByTestId("sims").textContent).toBe("1"), { timeout: 5000 });
	});

	it("ignores an unknown message type", async () => {
		serve(JSON.stringify({ type: "who_knows", data: 1 }));
		render(
			<WebSocketManager>
				<ChaosProbe />
			</WebSocketManager>,
		);
		await waitFor(() => expect(screen.getByTestId("conn").textContent).toBe("true"), { timeout: 5000 });
		expect(screen.getByTestId("sims").textContent).toBe("0");
	});
});
