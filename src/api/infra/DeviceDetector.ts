import { spawnSync } from "child_process";

/**
 * Detects whether the machine running this Node process is a Mac Mini.
 * Works on macOS; returns false on Linux/Windows.
 */
export function isMacMini(): boolean {
    if (process.platform !== "darwin") return false;

    const result = spawnSync("sysctl", ["-n", "hw.model"], { encoding: "utf-8" });
    if (result.status !== 0 || !result.stdout) return false;

    // Model identifiers for Mac Mini always start with "Macmini"
    // e.g. "Macmini9,1" (M1), "Macmini8,1" (Intel 2018), etc.
    const model = result.stdout.trim();
    return model.toLowerCase().startsWith("macmini");
}