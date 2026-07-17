import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Frontend components read a handful of build-time `process.env.*` values that
// vite.config.ts injects via `define`. Mirror them here so component tests see
// the same (stubbed) values instead of `undefined`.
const frontendDefine = {
	"process.env.MONITOR_WS_PORT": JSON.stringify("8001"),
	"process.env.HEADSETS_IP": JSON.stringify(""),
	"process.env.ENV_MAX_ELEMENTS": JSON.stringify(""),
	"process.env.IMAGE_SOURCE_FOLDER": JSON.stringify(""),
};

export default defineConfig({
	test: {
		// One runner, three isolated projects. `npm run test:unit` runs the first
		// two (offline, no hardware); `test:integration` runs the last (needs a
		// live GAMA server and is auto-skipped when none is reachable).
		projects: [
			{
				test: {
					name: "unit",
					environment: "node",
					include: ["src/api/**/*.test.ts", "src/common/**/*.test.ts"],
				},
			},
			{
				plugins: [react()],
				define: frontendDefine,
				test: {
					name: "frontend",
					environment: "jsdom",
					globals: true,
					setupFiles: ["./test/setup/frontend.ts"],
					include: ["src/{components,hooks,languages,i18next}/**/*.test.{ts,tsx}"],
				},
			},
			{
				test: {
					name: "integration",
					environment: "node",
					include: ["test/integration/**/*.test.ts"],
					testTimeout: 30_000,
					hookTimeout: 30_000,
				},
			},
		],
		coverage: {
			provider: "v8",
			reportsDirectory: "./coverage",
			include: ["src/**/*.{ts,tsx}"],
			exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.d.ts", "src/main.tsx", "src/workers/**", "test/**"],
		},
	},
});
