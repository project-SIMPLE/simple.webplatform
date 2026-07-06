/**
 * Shared runtime constants used by both frontend and backend.
 */

/**
 * Maps the last IP octet of a headset's identifier to a color name.
 * Used exclusively in image file paths (e.g. Headset_blue.png, Frame_green.png).
 * Falls back to "black" for unknown identifiers.
 */
export const HEADSET_COLOR_NAME: Record<string, string> = {
	"101": "blue",
	"102": "green",
	"103": "orange",
	"104": "purple",
	"105": "yellow",
	"106": "black",
};

/**
 * Maps the last IP octet of a headset's identifier to a Tailwind background class.
 * Used exclusively as a className on DOM elements.
 * Falls back to "bg-gray-900" (black) for unknown identifiers.
 */
export const HEADSET_COLOR_CLASS: Record<string, string> = {
	"101": "bg-blue-500",
	"102": "bg-green-500",
	"103": "bg-orange-500",
	"104": "bg-purple-500",
	"105": "bg-yellow-400",
	"106": "bg-gray-900",
};
