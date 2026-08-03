/**
 * Aspect-ratio correction for scrcpy video sessions.
 *
 * Some Quest headsets report an inverted (portrait) video stream on the first
 * connection — width < height, or no metadata at all — which renders the headset
 * view in portrait instead of landscape. When that is detected the server closes
 * the session and retries with a flipped crop.
 *
 * See https://github.com/project-SIMPLE/simple.webplatform/issues/78
 */
export interface StreamMetadata {
	width?: number;
	height?: number;
}

/**
 * Whether a session's video metadata indicates an inverted aspect ratio that
 * needs the flipped-crop retry. Only Quest devices are corrected — other models
 * are left untouched (no crop is applied to unknown devices).
 */
export function isInvertedAspectRatio(metadata: StreamMetadata | undefined, deviceModel: string): boolean {
	if (!deviceModel.startsWith("Quest")) return false;
	if (metadata === undefined) return true;
	// Raw comparison mirrors the original guard: undefined dimensions compare
	// false, so a defined-but-empty metadata object is not treated as inverted.
	return (metadata.width as number) < (metadata.height as number);
}
