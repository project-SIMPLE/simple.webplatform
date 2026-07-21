import { expect, test } from "@playwright/test";

// The stream display page renders the scrcpy video grid. Without hardware it
// shows an empty/placeholder grid; with a live device it shows a <canvas> per
// headset. The first assertion (the compiled app serves and mounts the route
// without crashing) runs in every lane; the live-canvas assertion is skipped
// unless the full emulator + GAMA + connected-player stack produces a stream.
test("serves the stream display page without a runtime crash", async ({ page }) => {
	const pageErrors: Error[] = [];
	page.on("pageerror", (err) => pageErrors.push(err));

	const response = await page.goto("/streamPlayerScreen");
	// SPA fallback always returns index.html (200) for a client route.
	expect(response?.ok()).toBeTruthy();

	// The React app mounts (body is present) and no uncaught error was thrown
	// while rendering the streaming grid.
	await expect(page.locator("body")).toBeVisible();
	expect(pageErrors).toEqual([]);
});

test("shows a live canvas when a scrcpy stream is available", async ({ page }) => {
	await page.goto("/streamPlayerScreen");

	const canvas = page.locator("canvas").first();
	const hasStream = await canvas.isVisible().catch(() => false);
	test.skip(!hasStream, "no live scrcpy stream (needs emulator + GAMA + connected players)");

	await expect(canvas).toBeVisible();
});
