import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WsWebSocket, { WebSocketServer } from "ws";
import type { Controller } from "../../api/core/Controller.ts";
import { MonitorServer } from "../../api/monitoring/MonitorServer.ts";
import WebSocketManager, { useWebSocket } from "./WebSocketManager.tsx";

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
