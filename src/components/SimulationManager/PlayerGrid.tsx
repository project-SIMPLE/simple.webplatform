import type { PlayerList } from "../../common/types";
import VRHeadset from "../VRHeadset/VRHeadset";
import SimulationManagerPlayer from "./SimulationManagerPlayer";

interface PlayerGridProps {
	playerList: PlayerList;
	maxPlayers: string | number;
}

/** Row of connected headsets plus transparent placeholder slots up to maxPlayers. */
const PlayerGrid = ({ playerList, maxPlayers }: PlayerGridProps) => {
	const connected = Object.keys(playerList).length;
	// Stable slot ids for the empty places. Don't use crypto.randomUUID() here: it only exists in
	// secure contexts (HTTPS or localhost), so opening the page by LAN IP (e.g. from an iPad) threw
	// during render and blanked the whole page.
	const emptySlots = Array.from(
		{ length: Math.max(0, Number(maxPlayers) - connected) },
		(_, i) => `placeholder-slot-${connected + i + 1}`,
	);
	return (
		<div className="flex justify-center items-center  space-x-4 ">
			{/*Display Headset Connected */}
			{Object.keys(playerList).map((key) => {
				const player = playerList[key];
				return <SimulationManagerPlayer key={key} Playerkey={key} selectedPlayer={player} playerId={key} />;
			})}

			{/* //!       Display remaining headsets in transparent orange if the number of detected players is less than the maximum number of players */}
			{emptySlots.map((slotId) => (
				<div key={slotId} className="flex flex-col items-center cursor-not-allowed">
					<VRHeadset />
				</div>
			))}
		</div>
	);
};

export default PlayerGrid;
