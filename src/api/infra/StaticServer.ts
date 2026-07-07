import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getLogger } from "@logtape/logtape";
import type { NextFunction, Request, Response } from "express";
import express from "express";

const logger = getLogger(["infra", "StaticServer"]);

const MIME: Record<string, string> = {
	html: "text/html; charset=utf-8",
	js: "application/javascript",
	mjs: "application/javascript",
	css: "text/css",
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	svg: "image/svg+xml",
	ico: "image/x-icon",
	json: "application/json",
	woff: "font/woff",
	woff2: "font/woff2",
	ttf: "font/ttf",
	otf: "font/otf",
	webp: "image/webp",
};

interface SeaModule {
	isSea(): boolean;
	getAsset(key: string): ArrayBuffer;
}

function getSea(): SeaModule | null {
	try {
		// process.execPath is always an absolute path and works as a createRequire
		// base on any platform; import.meta.url is not valid in Vite's CJS bundle.
		const req = createRequire(process.execPath);
		const sea = req("node:sea");
		return sea.isSea() ? sea : null;
	} catch (_) {
		return null;
	}
}

export class StaticServer {
	constructor() {
		logger.debug(`Starting express server for static files...`);
		const app = express();
		const port = process.env.WEB_APPLICATION_PORT || "5173";

		const sea = getSea();

		if (sea) {
			// SEA mode: serve frontend files from embedded SEA assets.
			// Assets are keyed as "dist/<relative-path>" (e.g. "dist/index.html").
			app.use((req: Request, res: Response, next: NextFunction) => {
				const urlPath = req.path === "/" ? "/index.html" : req.path;
				const assetKey = `dist${urlPath}`;
				try {
					const buf = sea.getAsset(assetKey);
					const ext = path.extname(urlPath).slice(1).toLowerCase();
					res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
					res.send(Buffer.from(buf));
				} catch (_) {
					next();
				}
			});
			// SPA fallback
			app.get("*", (_req: Request, res: Response) => {
				try {
					res.setHeader("Content-Type", "text/html; charset=utf-8");
					res.send(Buffer.from(sea.getAsset("dist/index.html")));
				} catch (_) {
					res.status(404).send("Not found");
				}
			});
		} else {
			// Dev / pkg mode: serve from the filesystem.
			const __dirname = path.dirname(fileURLToPath(import.meta.url));
			const candidates = [
				path.resolve(__dirname, "dist"),
				path.resolve(__dirname, "../dist"),
				path.resolve(__dirname, "../../../dist"),
			];
			let distPath = "";
			for (const p of candidates) {
				if (fs.existsSync(p)) {
					distPath = p;
					break;
				}
			}
			if (!distPath) {
				logger.error("Could not find 'dist' directory for static files");
				return;
			}
			logger.debug(`Serving static files from: ${distPath}`);
			app.use(express.static(distPath));
			app.get("*", (_req: Request, res: Response) => res.sendFile(path.join(distPath, "index.html")));
		}

		app.listen(port, () => {
			logger.info(
				`=========================================\n\n\tWebplatform started and is accessible\n\t\t     http://localhost:${port}\n\n=========================================`,
			);
		});
	}
}
