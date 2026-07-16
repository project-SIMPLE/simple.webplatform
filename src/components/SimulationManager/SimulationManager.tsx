//! accomodates the gama server map

import { useGamaExperiment } from "../../hooks/useGamaExperiment";
import Footer from "../Footer/Footer";
import Header from "../Header/Header";
import ExperimentControls from "./ExperimentControls";
import PlayerGrid from "./PlayerGrid";
import StatusBanner from "./StatusBanner";

const SimulationManager = () => {
	const { gama, gamaless, playerList, selectedSimulation, maxPlayers, minPlayers, handlePlayPause, handleEnd } =
		useGamaExperiment();
	const playerCount = Object.keys(playerList).length;

	return (
		<div className="flex flex-col h-full justify-between">
			<Header />
			<div className="flex flex-col items-center justify-center rounded-lg text-center h-2/3 mx-16">
				{selectedSimulation ? (
					<div>
						<h1 className="text-3xl mb-4">{selectedSimulation.name}</h1>

						<PlayerGrid playerList={playerList} maxPlayers={maxPlayers} />

						{/* Buttons Simulations : Play Button, Pause Button, Stop Button  */}
						{gamaless ? (
							<StatusBanner
								gamaless
								experimentState={gama.experiment_state}
								playerCount={playerCount}
								minPlayers={minPlayers}
								maxPlayers={maxPlayers}
							/>
						) : (
							<div className="relative flex flex-col items-center justify-center gap-4">
								<StatusBanner
									gamaless={false}
									experimentState={gama.experiment_state}
									playerCount={playerCount}
									minPlayers={minPlayers}
									maxPlayers={maxPlayers}
									foreignExperimentDetected={gama.foreign_experiment_detected}
								/>
								<ExperimentControls
									experimentState={gama.experiment_state}
									playerCount={playerCount}
									minPlayers={minPlayers}
									maxPlayers={maxPlayers}
									onPlayPause={handlePlayPause}
									onEnd={handleEnd}
								/>
							</div>
						)}
					</div>
				) : (
					<div className="text-3xl mb-4">No simulation selected</div>
				)}
			</div>

			{/* Footer of the page */}
			<Footer />
		</div>
	);
};

export default SimulationManager;
