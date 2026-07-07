import { getLogger } from "@logtape/logtape";
import type { GamaState, VU_CATALOG_SETTING_JSON, VU_MODEL_SETTING_JSON } from "../../common/types";

interface SimulationListProps {
	list: (VU_MODEL_SETTING_JSON | VU_CATALOG_SETTING_JSON)[];
	handleSimulation: (index: number) => void;
	gama: GamaState;
	className?: string;
}
const logger = getLogger(["components", "SimulationList"]);

const SimulationList = ({ list, handleSimulation, gama, className }: SimulationListProps) => {
	if (!Array.isArray(list)) {
		logger.error("SimulationList received non-array list: {list}", { list });
		return null;
	}

	/**
	 * Simple deterministic hash of a string into a non-negative integer.
	 * Guarantees the same input always yields the same output.
	 */
	const hashString = (str: string): number => {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash |= 0; // Convert to 32-bit integer
		}
		return Math.abs(hash) % frame.length;
	};

	const frame = [
		` /images/Game_selection/Game_selection_Aquadefender.png`,
		` /images/Game_selection/Game_selection_Lulut.png`,
		` /images/Game_selection/Game_selection_Cambodia.png`,
		` /images/Game_selection/Game_selection_Biodivrestorer.png`,
		` /images/Game_selection/Game_selection_OZD.png`,
		` /images/Game_selection/Game_selection_Lao.png`,
	];

	return (
		<div className="flex flex-row w-full justify-evenly">
			{list.map((simulation: VU_MODEL_SETTING_JSON | VU_CATALOG_SETTING_JSON, index: number) => (
				<div className="items-center text-center w-fit " key={simulation.name ?? simulation.model_file_path}>
					<div
						className={`rounded-2xl items-center  cursor-pointer relative size-[13dvw]  ${className && className}  ${!gama.connected && "opacity-50"}`}
						onClick={gama.connected ? () => handleSimulation(index) : () => {}}
					>
						{/* {simulation.type == "catalog" ? <img src={` /images/Headset/Headset_04_orange.png`} className='rounded-full bg-slate-500 opacity-90 size-16 absolute top-[40%] left-[40%] z-20' /> : null} //? downward arrow */}
						<div className="relative size-full bg-[#fcf7ec] hover:scale-110 transition-transform duration-200">
							{simulation.type === "catalog" ? (
								<img
									src={` /images/Game_selection/Game_selection_Folder.png`}
									className="absolute scale-110 top-[-10%]"
									alt=""
								/>
							) : (
								<img src={frame[hashString(simulation.name)]} alt="frame" className="absolute scale-110" />
							)}
							{/* //TODO the src of the image is a placeholder, selects one of the 5 frames at random */}
							<img
								src={simulation.splashscreen?.trim() ? simulation.splashscreen.trim() : "/images/simple_logo.png"}
								className="h-full -z-10 bg-[#fcf7ec]"
								onError={(e) => {
									const target = e.currentTarget;
									// Prevent infinite loop if the fallback is also broken
									if (target.src.includes("simple_logo.png")) return;

									target.src = "/images/Logos/simple_logo.png";
									logger.warn("couldn't load an image for simulation {index}, using the placeholder", { index });
								}}
							/>
						</div>
					</div>

					<h2 className="text-sm text-center mt-7 text-[#0B374D]">
						{/*                                                                                                                     ↓ added one for folders to start at 1 instead of 0 */}
						{simulation.type === "json_settings"
							? simulation.name
							: simulation.name
								? simulation.name
								: `subprojects folder n°${index + 1}`}
					</h2>
				</div>
			))}
		</div>
	);
};

export default SimulationList;
