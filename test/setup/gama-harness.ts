import fs from "node:fs";
import path from "node:path";
import { vi } from "vitest";
import type Controller from "../../src/api/core/Controller.ts";
import Model from "../../src/api/simulation/Model.ts";
import type { VU_MODEL_SETTING_JSON } from "../../src/common/types.ts";

/** A real Model for the bundled demo learning-package (vr_xp). */
export function demoModel(): Model {
	const settingsPath = path.resolve(process.cwd(), "learning-packages/demo/settings.json");
	const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as VU_MODEL_SETTING_JSON;
	return new Model(settingsPath, settings);
}

export interface GamaHarness {
	controller: Controller;
	/** Spy on outputs GAMA broadcasts back through the controller. */
	broadcastSimulationOutput: ReturnType<typeof vi.fn>;
	/** Mutable player registry the connector consults for id/state resolution. */
	players: Map<string, { in_game: boolean }>;
}

/**
 * Minimal Controller wiring for connector-level GAMA tests: a real active model
 * plus a mutable player registry, with no-op stubs for the rest. Only the pieces
 * GamaConnector actually calls during a session are provided.
 */
export function makeGamaHarness(model: Model): GamaHarness {
	const broadcastSimulationOutput = vi.fn();
	const players = new Map<string, { in_game: boolean }>();
	const controller = {
		notifyMonitor: () => {},
		cancelLaunchInterval: () => {},
		broadcastSimulationOutput,
		player_manager: {
			disableAllPlayerInGame: () => {
				for (const p of players.values()) p.in_game = false;
			},
			getPlayerState: (id: string) => players.get(id),
			getPlayerId: (id: string) => id,
			togglePlayerInGame: (id: string, inGame: boolean) => {
				const p = players.get(id);
				if (p) p.in_game = inGame;
			},
		},
		model_manager: { getActiveModel: () => model },
	} as unknown as Controller;
	return { controller, broadcastSimulationOutput, players };
}

/** Poll `predicate` until true or throw after `timeoutMs`. */
export async function waitFor(predicate: () => boolean, timeoutMs: number, label: string): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (predicate()) return;
		await new Promise((r) => setTimeout(r, 100));
	}
	throw new Error(`Timed out after ${timeoutMs}ms waiting for: ${label}`);
}
