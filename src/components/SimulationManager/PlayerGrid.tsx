import type { PlayerList } from "../../common/types";
import VRHeadset from "../VRHeadset/VRHeadset";
import SimulationManagerPlayer from "./SimulationManagerPlayer";

interface PlayerGridProps {
	playerList: PlayerList;
	maxPlayers: string | number;
}

/** Row of connected headsets plus transparent placeholder slots up to maxPlayers. */
const PlayerGrid = ({ playerList, maxPlayers }: PlayerGridProps) => {
	return (
		<div className="flex justify-center items-center  space-x-4 ">
			{/*Display Headset Connected */}
			{Object.keys(playerList).map((key) => {
				const player = playerList[key];
				return <SimulationManagerPlayer key={key} Playerkey={key} selectedPlayer={player} playerId={key} />;
			})}

			{/* //!       Display remaining headsets in transparent orange if the number of detected players is less than the maximum number of players */}
			{Array.from({ length: Number(maxPlayers) - Object.keys(playerList).length }).map((_, index) => (
				<div key={`placeholder-${index}`} className="flex flex-col items-center cursor-not-allowed">
					<VRHeadset />
				</div>
			))}
		</div>
	);
};

export default PlayerGrid;
