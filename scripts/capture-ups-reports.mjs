/**
 * capture-ups-reports — dump data from a connected APC UPS into JSON fixtures for
 * src/api/infra/ups/apc-ups-hid.test.ts.
 *
 * This is a MANUAL developer tool. It needs a physical APC UPS on USB and is never
 * run in CI (GitHub Actions cannot attach a UPS). Use it to record real data to
 * replay in the tests instead of hand-writing bytes.
 *
 * Two modes:
 *
 *   1. Snapshot (default) — read every feature report once. Drops straight into the
 *      getStatus() decode assertions.
 *        node scripts/capture-ups-reports.mjs on-battery
 *      -> test/fixtures/ups/on-battery.json  { reports, expected }
 *
 *   2. Trace (--trace N) — poll N times and record the stream of status "messages"
 *      over time. Pull the wall plug / let the battery drain while it runs to
 *      capture real power-lost / battery-low / battery-critical transitions.
 *        node scripts/capture-ups-reports.mjs power-pull --trace 60 --interval 2000
 *      -> test/fixtures/ups/power-pull.trace.json  { intervalMs, samples: [...] }
 *      The `*.trace.json` files are replayed by the "trace replay" test.
 *
 * Options: [name] [--trace N] [--interval ms] [--vendor 0x051d] [--product 0x0002]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import HID from "node-hid";

// Report IDs mirror the REPORT map in src/api/infra/ups/apc-ups-hid.ts. Each entry
// is [reportId, byteLength] — the length passed to getFeatureReport (id byte + data).
const REPORTS = [
	["REMAINING_CAPACITY", 0x0c, 2],
	["FULL_CHARGE_CAPACITY", 0x0d, 2],
	["RUNTIME_TO_EMPTY", 0x0f, 3],
	["DELAY_BEFORE_SHUTDOWN", 0x15, 3],
	["AC_PRESENT", 0x13, 2],
	["INPUT_VOLTAGE", 0x30, 2],
	["INPUT_VOLTAGE_PRECISE", 0x31, 3],
	["LOW_VOLTAGE_TRANSFER", 0x32, 3],
	["HIGH_VOLTAGE_TRANSFER", 0x33, 3],
	["CONFIG_ACTIVE_POWER", 0x52, 3],
	["AUDIBLE_ALARM_CONTROL", 0x78, 2],
];

function parseArgs(argv) {
	const args = { name: null, vendor: 0x051d, product: 0x0002, trace: 0, interval: 2000 };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--vendor") args.vendor = Number.parseInt(argv[++i], 16);
		else if (a === "--product") args.product = Number.parseInt(argv[++i], 16);
		else if (a === "--trace") args.trace = Number.parseInt(argv[++i], 10);
		else if (a === "--interval") args.interval = Number.parseInt(argv[++i], 10);
		else if (!a.startsWith("--")) args.name = a;
	}
	return args;
}

/** Read every report once into a { reportId: bytes[] } map. */
function readReports(device) {
	const reports = {};
	for (const [label, id, len] of REPORTS) {
		try {
			reports[String(id)] = Array.from(device.getFeatureReport(id, len));
		} catch (err) {
			console.warn(`  skipped ${label} (0x${id.toString(16)}): ${err.message}`);
		}
	}
	return reports;
}

/** Decode the fields the driver derives — mirrors apc-ups-hid.ts read semantics. */
function decode(reports) {
	const u8 = (id) => {
		const b = reports[String(id)] ?? [id, 0];
		return b.length >= 2 ? b[1] : b[0];
	};
	const u16 = (id) => {
		const b = reports[String(id)] ?? [id, 0];
		if (b.length >= 3) return b[1] | (b[2] << 8);
		if (b.length === 2) return b[0] | (b[1] << 8);
		return b[0];
	};
	const s16 = (id) => {
		const v = u16(id);
		return v > 32767 ? v - 65536 : v;
	};
	const acPresent = u8(0x13) === 1;
	return {
		batteryCharge: u8(0x0c),
		runtimeSeconds: u16(0x0f),
		acPresent,
		onBattery: !acPresent,
		shutdownTimer: s16(0x15),
		inputVoltage: u8(0x30),
	};
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const { name, vendor, product, trace, interval } = parseArgs(process.argv.slice(2));

const found = HID.devices().filter((d) => d.vendorId === vendor && d.productId === product);
if (found.length === 0) {
	console.error(
		`No UPS found (vendorId=0x${vendor.toString(16)}, productId=0x${product.toString(16)}). Is it plugged in via USB?`,
	);
	process.exit(1);
}

const device = new HID.HID(found[0].path);
const product_name = found[0].product ?? "APC UPS";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "test", "fixtures", "ups");
mkdirSync(outDir, { recursive: true });

if (trace > 0) {
	// ── Trace mode: record the message stream over time ──
	console.log(`Tracing ${trace} samples every ${interval}ms — pull the plug / drain the battery now.`);
	const start = Date.now();
	const samples = [];
	for (let i = 0; i < trace; i++) {
		const reports = readReports(device);
		const decoded = decode(reports);
		samples.push({ tMs: Date.now() - start, reports, decoded });
		console.log(
			`  [${i + 1}/${trace}] ac=${decoded.acPresent} battery=${decoded.batteryCharge}% shutdown=${decoded.shutdownTimer}`,
		);
		if (i < trace - 1) await sleep(interval);
	}
	device.close();

	const fixtureName = name ?? `trace-${Date.now()}`;
	const outFile = join(outDir, `${fixtureName}.trace.json`);
	writeFileSync(
		outFile,
		`${JSON.stringify({ name: fixtureName, description: `Trace from ${product_name} on ${new Date().toISOString()}.`, intervalMs: interval, samples }, null, "\t")}\n`,
	);
	console.log(`Wrote ${samples.length}-sample trace to ${outFile}`);
} else {
	// ── Snapshot mode: one read of every report ──
	const reports = readReports(device);
	device.close();

	const fixtureName = name ?? `capture-${Date.now()}`;
	const outFile = join(outDir, `${fixtureName}.json`);
	writeFileSync(
		outFile,
		`${JSON.stringify(
			{
				name: fixtureName,
				description: `Captured from ${product_name} on ${new Date().toISOString()}.`,
				reports,
				// Copy the decoded snapshot below into `expected` (verify by hand).
				expected: decode(reports),
			},
			null,
			"\t",
		)}\n`,
	);
	console.log(`Wrote ${Object.keys(reports).length} reports to ${outFile}`);
	console.log("Decoded snapshot:", decode(reports));
}
