/**
 * Display size precondition for scrcpy video sessions.
 *
 * scrcpy captures the logical display, so a `wm size` override (e.g. 12384x2208 on a
 * 4128x2208 Quest 3) stretches the captured frame and the fixed per-model crop zooms
 * into the lens edge. scrcpy does not pick up a size change mid-session, so the
 * override has to be gone before the session starts.
 *
 * See https://github.com/project-SIMPLE/simple.webplatform/issues/192
 */
import { getLogger } from "@logtape/logtape";
import type { Adb } from "@yume-chan/adb";

const logger = getLogger(["android", "ScrcpyServer"]);

/**
 * Display size override reported by `wm size` (e.g. "12384x2208"), or null when the
 * device runs at its physical size. `wm size` prints an "Override size:" line only
 * when an override is set.
 */
export function parseDisplaySizeOverride(wmSizeOutput: string): string | null {
	return wmSizeOutput.match(/Override size:\s*(\d+x\d+)/)?.[1] ?? null;
}

/** Remove any display size override, checking afterwards that it is really gone. */
export async function resetDisplaySizeOverride(adb: Adb, logPrefix: string): Promise<void> {
	const wmSize = async () =>
		parseDisplaySizeOverride(await adb.subprocess.noneProtocol.spawn("wm size").wait().toString());

	const override = await wmSize();
	if (override === null) {
		logger.trace(`[${logPrefix}] No display size override`);
		return;
	}

	logger.warn(`[${logPrefix}] Display size is overridden to ${override}, resetting it before streaming...`);
	await adb.subprocess.noneProtocol.spawn("wm size reset").wait();

	if ((await wmSize()) !== null) {
		logger.error(`[${logPrefix}] Couldn't reset the display size override, the video stream will be distorted`);
	}
}
