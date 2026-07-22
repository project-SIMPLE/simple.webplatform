import { expect, test } from "@playwright/test";
import WebSocket from "ws";

// Regression: issue #153 — "Packaged Windows executable fails to forward Unity
// player messages to GAMA (`bufferUtil$1.mask is not a function`)".
//
// The bundled SEA binary stubbed out ws's optional `bufferutil` native addon, so
// the ws CLIENT that GamaConnector uses to talk to GAMA threw on every masked
// send. That killed the process the moment a player expression had to be
// forwarded to GAMA:
//   PlayerManager (uWS) -> Controller.sendExpression -> GamaConnector ws.send(GAMA)
//
// This runs only in the full-stack lane (compiled binary + live GAMA). It
// self-gates on GAMA being connected, so it skips cleanly on the binary-only and
// source lanes instead of failing.
const HEADSET_WS_PORT = process.env.HEADSET_WS_PORT ?? "8080";

test("forwards a Unity player message to GAMA without a bufferUtil crash (issue #153)", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByText("LinkToUnity")).toBeVisible({ timeout: 20_000 });

	// GAMA connection: tiles are enabled only once the platform reports GAMA connected.
	const tile = page.locator('button[data-nav-item="tile"]').first();
	let gamaConnected = true;
	try {
		await expect(tile).toBeEnabled({ timeout: 15_000 });
	} catch {
		gamaConnected = false;
	}
	test.skip(!gamaConnected, "platform did not connect to GAMA — needs a live GAMA server");

	// Launch and make the experiment actually RUNNING — player expressions are only
	// forwarded to GAMA while an experiment runs (GamaConnector.sendExpression guard).
	await tile.click();
	await expect(page).toHaveURL(/simulationManager/);
	await page.getByLabel("Play").click();
	await expect(page.getByLabel("Stop")).toBeVisible({ timeout: 30_000 });
	const pause = page.getByLabel("Pause");
	if (!(await pause.isVisible())) {
		await page.getByLabel("Play").click(); // GAMA loads paused — resume it
	}
	await expect(pause).toBeVisible({ timeout: 30_000 });

	// A Unity headset connects to the player WebSocket and forwards an expression.
	// This is the exact path that crashed the packaged binary in #153.
	const player = new WebSocket(`ws://127.0.0.1:${HEADSET_WS_PORT}`);
	try {
		await new Promise<void>((resolve, reject) => {
			player.once("open", () => resolve());
			player.once("error", reject);
		});
		player.send(JSON.stringify({ type: "connection", id: "e2e_player", heartbeat: 5000 }));
		// Let the server register the player, then forward an expression to GAMA.
		await new Promise((r) => setTimeout(r, 500));
		player.send(JSON.stringify({ type: "expression", id: "e2e_player", expr: 'write "hello from e2e";' }));
		await new Promise((r) => setTimeout(r, 1000));
	} finally {
		player.close();
	}

	// Had the forward crashed the binary (bufferUtil.mask), the experiment would be
	// gone and the page unresponsive. It is still running and controllable.
	await expect(page.getByLabel("Pause")).toBeVisible({ timeout: 10_000 });
	await page.getByLabel("Stop").click();
	await expect(page.getByText("LinkToUnity")).toBeVisible({ timeout: 15_000 });
});
