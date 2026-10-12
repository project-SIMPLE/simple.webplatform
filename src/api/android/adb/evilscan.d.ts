// evilscan ships no type declarations and has no @types package.
// Minimal typings covering what DeviceFinder uses.
declare module "evilscan" {
	import { EventEmitter } from "node:events";

	export interface EvilscanOptions {
		/** IP, CIDR range or hostname to scan */
		target: string;
		/** Single port, comma-separated list and/or ranges (e.g. "5555,30000-49999") */
		port: string;
		/** Statuses to report, any of 'TROU': Timeout, Refused, Open, Unreachable */
		status?: string;
		/** How many ports to test in parallel */
		concurrency?: number;
		/** Milliseconds before closing a connection */
		timeout?: number;
		banner?: boolean;
	}

	export interface EvilscanResult {
		ip: string;
		port: number;
		status?: string;
		banner?: string;
	}

	export default class Evilscan extends EventEmitter {
		constructor(options: EvilscanOptions, callback?: (error: unknown, scan: Evilscan) => void);
		on(event: "result", listener: (data: EvilscanResult) => void): this;
		on(event: "error", listener: (error: unknown) => void): this;
		on(event: "done" | "start", listener: () => void): this;
		run(callback?: () => void): void;
		pause(): void;
		unpause(): void;
		abort(): void;
	}
}
