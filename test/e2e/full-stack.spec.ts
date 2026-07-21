import { expect, test } from "@playwright/test";

// The real end-to-end flow: the compiled platform picks up a live GAMA server and
// an experiment is launched from the browser. Combined with app.spec (shell + model
// list) and streaming.spec (a connected device's screen streaming to a <canvas>),
// this covers the whole stack the `test-e2e-full` CI job spins up: GAMA + Android
// emulator + the compiled binary.
//
// The spec self-gates on GAMA being connected (tiles enabled), so it skips cleanly
// on lanes without GAMA (the source e2e / binary-only lanes) instead of failing.
test("platform connects to GAMA and launches an experiment from the browser", async ({ page }) => {
	await page.goto("/");
	// Model list served by the real ModelManager.
	await expect(page.getByText("LinkToUnity")).toBeVisible({ timeout: 20_000 });

	// GAMA connection: tiles are enabled only once the platform reports GAMA connected.
	// Keep this probe well under the test timeout so a missing GAMA skips cleanly
	// instead of tripping the test-level timeout.
	const tile = page.locator('button[data-nav-item="tile"]').first();
	let gamaConnected = true;
	try {
		await expect(tile).toBeEnabled({ timeout: 15_000 });
	} catch {
		gamaConnected = false;
	}
	test.skip(!gamaConnected, "platform did not connect to GAMA — needs a live GAMA server");

	// Select the simulation → sends it to GAMA and opens the manager.
	await tile.click();
	await expect(page).toHaveURL(/simulationManager/);

	// The demo's minimal_players is 0, so the launch control is available with no
	// headsets. Launch the GAMA experiment straight from the browser.
	const play = page.getByLabel("Play");
	await expect(play).toBeVisible({ timeout: 15_000 });
	await play.click();

	// GAMA loads and runs the experiment → the controls switch to pause + stop.
	await expect(page.getByLabel("Pause")).toBeVisible({ timeout: 30_000 });

	// Stop the experiment; the UI navigates back to the selector.
	await page.getByLabel("Stop").click();
	await expect(page.getByText("LinkToUnity")).toBeVisible({ timeout: 15_000 });
});
