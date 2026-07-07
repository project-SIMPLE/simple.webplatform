import { useEffect, useRef, useState } from "react";
import { HEADSET_COLOR_CLASS, HEADSET_COLOR_NAME } from "../../common/constants";
import visibility_off from "../../svg_logos/visibility_off.svg";
import x_cross from "../../svg_logos/x_cross.svg";

// All hooks in this component are called unconditionally — the early `return null` at the
// top guards against an invalid id, but it runs before any hook call.
interface PlayerScreenCanvasProps {
	isPlaceholder?: boolean; // if true, renders an empty placeholder div instead of a canvas tile
	needsInteractivity?: boolean; // enables click-to-popup behaviour for the StreamPlayersScreenControl page
	canvas?: HTMLCanvasElement; // the canvas element managed by VideoStreamManager; attached to the DOM via a ref inside the useEffect
	id?: string; // headset identifier (e.g. "192.168.1.101:5555"); used to derive color and display the player label
	hideInfos?: boolean; // hides the player id label, used in fullscreen mode
}

const PlayerScreenCanvas = ({ canvas, id, isPlaceholder, hideInfos, needsInteractivity }: PlayerScreenCanvasProps) => {
	const ipIdentifier: string = id ? id.split(":")[0].split(".")[id.split(".").length - 1] : "";
	const canvasref = useRef<HTMLDivElement>(null);
	const popupref = useRef<HTMLDivElement>(null);
	const bgColor = HEADSET_COLOR_CLASS[ipIdentifier] ?? "bg-gray-900";
	const [showPopup, setShowPopup] = useState<boolean>(false);

	// Attach the managed canvas to the DOM. The canvas always fits its container via
	// object-contain, so the grid (VideoStreamManager) controls the cell size and the
	// canvas scales to fit — no per-count dimension classes to juggle.
	useEffect(() => {
		if (canvas) {
			canvas.classList.remove(...canvas.classList);
			canvas.classList.add("object-contain");

			if (showPopup) {
				if (popupref.current) {
					popupref.current.querySelector("canvas")?.remove();
					popupref.current.appendChild(canvas);
					canvas.classList.add("rounded-lg", "max-h-[95dvh]", "max-w-[95dvw]");
				}
			} else if (canvasref.current) {
				// Fill the inset holder; the holder insets from the frame border and clips the corners.
				canvas.classList.add("w-full", "h-full");
				canvasref.current.querySelector("canvas")?.remove();
				canvasref.current.appendChild(canvas);
			}
		}
	}, [canvas, showPopup]);

	if (!id) {
		return null;
	}
	const isColoredHeadset = true;
	const CanvasStyle = "flex flex-col border-4 border-none p-2 rounded-lg items-center justify-center ";

	return (
		<>
			{/* Popup */}
			{showPopup === true ? (
				<div
					className={`backdrop-blur-md w-full h-full fixed inset-0 flex flex-col items-center justify-center z-10`}
					onClick={() => setShowPopup(false)}
				>
					{/* <div ref={popupref} className={` ${isColoredHeadset ? bgColor : "bg-slate-500"} size-2/3 flex flex-col items-center justify-center`}> */}
					<div
						className={`rounded-md size-fit flex flex-col items-center relative`}
						onClick={(e) => e.stopPropagation()}
					>
						<div
							ref={popupref}
							className={`h-full flex flex-col p-1 rounded-md ${isColoredHeadset ? bgColor : "bg-slate-500"}`}
						>
							{hideInfos ? null : <p className="bg-slate-200 rounded-t-md p-1"> {`Player: ${id}`}</p>}
						</div>

						<button
							onClick={() => setShowPopup(false)}
							className="bg-white hover:bg-gray-200 rounded-full p-1 size-fit mb-2w"
							style={{ position: "absolute", top: "0.5rem", right: "0.5rem" }}
						>
							<img src={x_cross} alt="" className="mix-blend-difference size-8" />
						</button>
					</div>
				</div>
			) : null}

			{/* meaningful content */}
			{!isPlaceholder ? (
				<div
					className="w-full h-full relative"
					onClick={
						needsInteractivity
							? () => {
									setShowPopup(true);
								}
							: undefined
					}
				>
					{/* Frame border overlay — sits on top, never clipped */}
					<img
						src={` /images/Frames/Frame_${HEADSET_COLOR_NAME[ipIdentifier] ?? "black"}.png`}
						className="absolute inset-0 h-full w-full z-10 pointer-events-none"
						alt=""
					/>
					{/* Inset holder sits inside the frame border (extra room at the bottom, which isn't straight).
					    overflow-hidden + radius rounds only the canvas corners, leaving the frame untouched. */}
					<div ref={canvasref} className="absolute inset-[7%] overflow-hidden rounded-[5%]" />
				</div>
			) : (
				//  placeholder, with an eye icon
				<div className={`${CanvasStyle} bg-stone-100 relative w-full h-full`}>
					<img src={` /images/Frames/Frame_blue.png`} className="absolute inset-0 h-full w-full" alt="" />
					<img src={visibility_off} alt="" className="mix-blend-difference size-1/2" />
				</div>
			)}
		</>
	);
};

export default PlayerScreenCanvas;
