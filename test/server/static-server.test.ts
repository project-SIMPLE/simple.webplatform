import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { StaticServer } from "../../src/api/infra/StaticServer.ts";
import { freePort } from "../setup/free-port.ts";

// StaticServer resolves its dist directory relative to its own source file, in
// this order:
//   1. src/api/infra/dist
//   2. src/api/dist
//   3. <repo>/dist
//
// `test/integration/static-server.test.ts` exercises candidate 3 and therefore
// needs `npm run build:frontend` to have run — it skips otherwise. This file is
// hermetic instead: it plants a tiny fixture at candidate 1, which always wins,
// so the HTTP behaviour (static files, MIME types, SPA fallback, candidate
// order) is covered on every machine and in the fast CI lane.
//
// The fixture lives inside src/ because the candidate paths are hard-coded
// relative to the module. It is removed in afterAll, and `dist` is already
// gitignored at any depth, so a crashed run leaves nothing committable behind.

const INFRA_DIR = path.dirname(fileURLToPath(new URL("../../src/api/infra/StaticServer.ts", import.meta.url)));
const FIXTURE_DIST = path.join(INFRA_DIR, "dist");

const INDEX_HTML = "<!doctype html><html><head><title>fixture</title></head><body><div id=root></div></body></html>";
const APP_JS = "export const marker = 'fixture-app-js';\n";
const APP_CSS = ":root { --marker: fixture-css; }\n";

// StaticServer exposes no close() and no ready signal; poll until it answers.
async function get(url: string, retries = 50): Promise<Response> {
	for (let i = 0; i < retries; i++) {
		try {
			return await fetch(url);
		} catch {
			await new Promise((r) => setTimeout(r, 100));
		}
	}
	throw new Error(`StaticServer never came up at ${url}`);
}

describe("StaticServer HTTP behaviour (filesystem mode)", () => {
	let base: string;
	// Never delete a pre-existing directory we did not create.
	const weCreatedFixture = !fs.existsSync(FIXTURE_DIST);

	beforeAll(async () => {
		fs.mkdirSync(path.join(FIXTURE_DIST, "assets"), { recursive: true });
		fs.writeFileSync(path.join(FIXTURE_DIST, "index.html"), INDEX_HTML);
		fs.writeFileSync(path.join(FIXTURE_DIST, "assets", "app.js"), APP_JS);
		fs.writeFileSync(path.join(FIXTURE_DIST, "assets", "app.css"), APP_CSS);

		const port = await freePort();
		process.env.WEB_APPLICATION_PORT = String(port);
		base = `http://127.0.0.1:${port}`;
		new StaticServer();
	});

	afterAll(() => {
		if (weCreatedFixture) fs.rmSync(FIXTURE_DIST, { recursive: true, force: true });
	});

	it("serves index.html at the root", async () => {
		const res = await get(`${base}/`);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toMatch(/text\/html/);
		expect(await res.text()).toContain("<title>fixture</title>");
	});

	it("prefers the nearest dist candidate over the repository-root one", async () => {
		// The body is the fixture's, not a real built frontend — proof that
		// candidate 1 (src/api/infra/dist) shadowed candidate 3 (<repo>/dist),
		// which exists on any machine that has run `npm run build:frontend`.
		const res = await get(`${base}/index.html`);
		expect(await res.text()).toBe(INDEX_HTML);
	});

	it("serves a static asset with a JavaScript content type", async () => {
		const res = await get(`${base}/assets/app.js`);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toMatch(/javascript/);
		expect(await res.text()).toBe(APP_JS);
	});

	it("serves a stylesheet with a CSS content type", async () => {
		const res = await get(`${base}/assets/app.css`);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toMatch(/text\/css/);
		expect(await res.text()).toBe(APP_CSS);
	});

	it("falls back to index.html for an unknown single-segment route", async () => {
		// react-router owns these paths; the server must not 404 them.
		const res = await get(`${base}/simulationManager`);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toMatch(/text\/html/);
		expect(await res.text()).toBe(INDEX_HTML);
	});

	it("falls back to index.html for a deep unknown route", async () => {
		const res = await get(`${base}/player/42/stream`);
		expect(res.status).toBe(200);
		expect(await res.text()).toBe(INDEX_HTML);
	});

	it("falls back to index.html for a missing asset rather than 404ing", async () => {
		// Documents current behaviour: the SPA catch-all also swallows genuinely
		// missing asset requests, so a broken bundle path returns HTML, not 404.
		const res = await get(`${base}/assets/does-not-exist.js`);
		expect(res.status).toBe(200);
		expect(await res.text()).toBe(INDEX_HTML);
	});

	it("does not leak files from outside dist via a traversal path", async () => {
		const res = await get(`${base}/../package.json`);
		expect(res.status).toBe(200);
		// Either normalised away by the router or answered by the SPA fallback —
		// what matters is that the repository's package.json is never served.
		expect(await res.text()).not.toContain("simple.webplatform");
	});
});
