import { getLogger } from "@logtape/logtape";
import { useEffect, useRef, useState } from "react";
import { HEADSET_COLOR_CLASS, HEADSET_COLOR_NAME } from "../../common/constants";
import visibility_off from "../../svg_logos/visibility_off.svg";
import x_cross from "../../svg_logos/x_cross.svg";

//TODO pour fix le problème du canvas qui est en petit, puis qui devient grand quand tu clique dessus, regarder les hook qui sont trigger quand on clique sur le canvas (surtout le truc qui applique les classes tailwind)
//TODO et juste nettoyer complètement le css à chaque fois, et le réappliquer pour éviter le problème, quitte à ce que le code soit redondant
// All hooks in this component are called unconditionally — the early `return null` at the
// top guards against an invalid id, but it runs before any hook call.
interface PlayerScreenCanvasProps {
	isPlaceholder?: boolean; // if true, renders an empty placeholder div instead of a canvas tile
	needsInteractivity?: boolean; // enables click-to-popup behaviour for the StreamPlayersScreenControl page
	canvas?: HTMLCanvasElement; // the canvas element managed by VideoStreamManager; attached to the DOM via a ref inside the useEffect
	id?: string; // headset identifier (e.g. "192.168.1.101:5555"); used to derive color and display the player label
	hideInfos?: boolean; // hides the player id label, used in fullscreen mode
	tailwindCanvasDim?: [string, string]; // [width-class, height-class] computed by VideoStreamManager's layout logic
	isLimitingWidth?: boolean; // true when width is the constraining dimension; controls flex/grid sizing
	gridDisplay?: boolean; // true when 4+ streams are shown; switches from flex to grid layout
}

const PlayerScreenCanvas = ({
	canvas,
	id,
	isPlaceholder,
	hideInfos,
	isLimitingWidth,
	tailwindCanvasDim,
	gridDisplay,
	needsInteractivity,
}: PlayerScreenCanvasProps) => {
	const logger = getLogger(["components", "PlayerScreenCanvas"]);

	const ipIdentifier: string = id ? id.split(":")[0].split(".")[id.split(".").length - 1] : "";
	const canvasref = useRef<HTMLDivElement>(null);
	const popupref = useRef<HTMLDivElement>(null);
	const bgColor = HEADSET_COLOR_CLASS[ipIdentifier] ?? "bg-gray-900";
	const [showPopup, setShowPopup] = useState<boolean>(false);

	useEffect(() => {
		if (canvas) {
			canvas.classList.remove(...canvas.classList);
			canvas.classList.add("rounded-lg");

			if (showPopup) {
				if (popupref.current) {
					popupref.current.querySelector("canvas")?.remove();
					popupref.current.appendChild(canvas);
					canvas.classList.add("max-h-[95dvh]");
					canvas.classList.add("max-w-[95dvw]");
				}
			} else {
				if (canvasref.current) {
					if (tailwindCanvasDim) {
						canvas.classList.add(tailwindCanvasDim[0]);
						canvas.classList.add(tailwindCanvasDim[1]);
					} else {
						logger.warn("no dimensions received, using default full screen values");
						canvas.classList.add("max-h-[95dvh]");
						canvas.classList.add("max-w-[95dvw]");
					}

					canvasref.current.querySelector("canvas")?.remove();
					canvasref.current.appendChild(canvas);
				}
			}
		}
	}, [canvas, showPopup, tailwindCanvasDim, logger.warn]);

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
					className={`flex flex-row items-center justify-center p-2 rounded-lg relative scale-95
                    ${gridDisplay ? "" : isLimitingWidth ? "max-w-full h-full" : "max-h-full w-full"}`}
					onClick={
						needsInteractivity
							? () => {
									setShowPopup(true);
								}
							: undefined
					}
				>
					<div ref={canvasref} className="w-fit h-fit relative">
						<img
							src={` /images/Frames/Frame_${HEADSET_COLOR_NAME[ipIdentifier] ?? "black"}.png`}
							className="absolute inset-0 h-full w-full scale-105"
						/>
					</div>
					{/* The Background Image */}

					{/* Your Canvas or other content goes here */}
					<div className="relative z-20">{/* Canvas element would live here */}</div>
				</div>
			) : (
				//  placeholder, with an eye icon
				<div
					className={`${CanvasStyle} bg-stone-100 ${isLimitingWidth ? "max-w-full h-full" : "max-h-full w-full"} aspect-square m-4 scale-95`}
				>
					{" "}
					{/*this only works under the assumption that the width is bigger than the height of the screen*/}
					<img src={` /images/Frames/Frame_blue.png`} className="absolute h-full w-auto scale-[103%]" alt="" />
					<img src={visibility_off} alt="" className="mix-blend-difference size-full" />
				</div>
			)}
		</>
	);
};

//

export default PlayerScreenCanvas;
