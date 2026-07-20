import { existsSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { StaticServer } from "../../src/api/infra/StaticServer.ts";
import { freePort } from "../setup/free-port.ts";

// Needs a built frontend at ./dist (StaticServer resolves ../../../dist from
// src/api/infra). CI runs `npm run build:frontend` first; skips otherwise.
const hasDist = existsSync("dist");
if (!hasDist) {
	console.warn("[static] no built dist/ — skipping StaticServer HTTP tests (run `npm run build:frontend`).");
}

// StaticServer has no close(); poll until the express listener answers.
async function get(url: string, retries = 30): Promise<Response> {
	for (let i = 0; i < retries; i++) {
		try {
			return await fetch(url);
		} catch {
			await new Promise((r) => setTimeout(r, 100));
		}
	}
	throw new Error(`StaticServer never came up at ${url}`);
}

describe.skipIf(!hasDist)("StaticServer serves the built frontend over HTTP", () => {
	let base: string;

	beforeAll(async () => {
		const port = await freePort();
		process.env.WEB_APPLICATION_PORT = String(port);
		base = `http://127.0.0.1:${port}`;
		new StaticServer();
	});

	it("serves index.html at /", async () => {
		const res = await get(`${base}/`);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toMatch(/text\/html/);
		expect(await res.text()).toMatch(/<html|<!doctype/i);
	});

	it("falls back to index.html for an unknown SPA route", async () => {
		const res = await get(`${base}/some/deep/spa/route`);
		expect(res.status).toBe(200);
		expect(await res.text()).toMatch(/<html|<!doctype/i);
	});
});
