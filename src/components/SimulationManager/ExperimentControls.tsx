import { Link } from "react-router-dom";

interface ExperimentControlsProps {
	experimentState: string;
	playerCount: number;
	minPlayers: string | number;
	maxPlayers: string | number;
	onPlayPause: () => void;
	onEnd: () => void;
}

const iconButton = "cursor-pointer hover:scale-110 transition-transform duration-200 bg-transparent border-none p-0";

/**
 * Experiment control buttons. Before launch it shows a play + display pair once enough
 * players are connected; while running it shows play/pause + stop + display. Renders null
 * when there is nothing to control (too few players, or all connected and auto-starting).
 */
const ExperimentControls = ({
	experimentState,
	playerCount,
	minPlayers,
	maxPlayers,
	onPlayPause,
	onEnd,
}: ExperimentControlsProps) => {
	// Pre-launch: only offer manual start once the minimum (but not yet the maximum) is reached.
	if (experimentState === "NONE" || experimentState === "NOTREADY") {
		if (playerCount >= Number(minPlayers) && playerCount < Number(maxPlayers)) {
			return (
				<div className="flex justify-center space-x-2 gap-10 mb-4 mt-4 ">
					<div>
						<button type="button" onClick={onPlayPause} aria-label="Play" className={iconButton}>
							<img src={` /images/Buttons/Button_play.png`} alt="" className="size-[6dvh]" />
						</button>
					</div>

					<Link to={"../streamPlayerScreen"} className="rounded-lg" target="_blank">
						<img
							src={` /images/Buttons/Button_Display.png`}
							alt="display button"
							className="size-[6dvh] hover:scale-110 transition-transform duration-200"
						/>
					</Link>
				</div>
			);
		}
		return null;
	}

	// Running / paused / launching.
	return (
		<div className="flex justify-center space-x-2 gap-10 mb-4 mt-4">
			{experimentState === "PAUSED" && (
				<button type="button" onClick={onPlayPause} aria-label="Play" className={iconButton}>
					<img src={` /images/Buttons/Button_play.png`} alt="" className="size-[6dvh]" />
				</button>
			)}
			{(experimentState === "RUNNING" || experimentState === "LAUNCHING") && (
				<button type="button" onClick={onPlayPause} aria-label="Pause" className={iconButton}>
					<img src={` /images/Buttons/Button_pause.png`} alt="" className="size-[6dvh]" />
				</button>
			)}
			<button type="button" onClick={onEnd} aria-label="Stop" className={iconButton}>
				<img src={` /images/Buttons/Button_stop.png`} alt="" className="size-[6dvh]" />
			</button>
			<Link to={"../streamPlayerScreen"} className=" rounded-lg">
				<img
					src={` /images/Buttons/Button_Display.png`}
					alt="streaming displays button"
					className="cursor-pointer hover:scale-110 transition-transform duration-200 size-[6dvh]"
				/>
			</Link>
		</div>
	);
};

export default ExperimentControls;
