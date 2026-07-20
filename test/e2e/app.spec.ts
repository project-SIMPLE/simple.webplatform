import { expect, test } from "@playwright/test";

// Drives the real rendered app against the real backend (StaticServer + MonitorServer
// + ModelManager). GAMA is not running, so tiles render disabled — video streaming is
// out of scope. This validates the full shell + data flow end-to-end.
test("loads the app and renders the demo simulation from the real backend", async ({ page }) => {
	await page.goto("/");

	// The header logo is always present.
	await expect(page.getByAltText("Logo")).toBeVisible();

	// The backend's ModelManager serves the bundled demo package; its tile appears
	// once the WebSocket delivers the simulation list.
	await expect(page.getByText("LinkToUnity")).toBeVisible({ timeout: 15_000 });

	// Without a live GAMA the simulation tiles are disabled.
	const tiles = page.locator('button[data-nav-item="tile"]');
	await expect(tiles.first()).toBeDisabled();

	// The language selector (real i18n) is reachable from the header.
	await expect(page.getByAltText("language selection")).toBeVisible();
});
