//! accomodates the gama server map

import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useGamaExperiment } from "../../hooks/useGamaExperiment";
import Footer from "../Footer/Footer";
import Header from "../Header/Header";
import VRHeadset from "../VRHeadset/VRHeadset";
import SimulationManagerPlayer from "./SimulationManagerPlayer";

const SimulationManager = () => {
	const {
		gama,
		gamaless,
		playerList,
		selectedSimulation,
		detectedPlayers,
		maxPlayers,
		minPlayers,
		handlePlayPause,
		handleEnd,
	} = useGamaExperiment();
	const { t } = useTranslation();

	return (
		<div className="flex flex-col h-full justify-between">
			<Header />
			<div className="flex flex-col items-center justify-center rounded-lg text-center h-2/3 mx-16">
				{selectedSimulation ? (
					<div>
						<h1 className="text-3xl mb-4">{selectedSimulation.name}</h1>

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

						{/* Buttons Simulations : Play Button, Pause Button, Stop Button  */}

						{gamaless ? (
							<div className="mt-4 px-4 py-2 bg-yellow-100 border-2 border-yellow-400 rounded-lg text-yellow-800 text-sm text-center">
								GAMALESS — simulation controls disabled
							</div>
						) : (
							<div className="relative flex flex-col items-center justify-center gap-4">
								{gama.experiment_state === "NONE" || gama.experiment_state === "NOTREADY" ? (
									detectedPlayers.length < Number(minPlayers) ? (
										<p className="flex items-center align-center" style={{ marginLeft: "90px" }}>
											{t("wait_minim_players_1")} {Number(minPlayers) - Object.keys(playerList).length}{" "}
											{t("wait_minim_players_2")}
											<img
												src={` /images/Headset_condition/Headset_condition_connecting.png`}
												className="size-8 right-0 bottom-0 animate-spin"
												alt="headset connecting"
											/>
										</p>
									) : Object.keys(playerList).length >= Number(minPlayers) &&
										Object.keys(playerList).length < Number(maxPlayers) ? (
										<>
											<p className="flex items-center w-fit">
												{t("wait_minim_players_1")} {Number(maxPlayers) - Object.keys(playerList).length}{" "}
												{t("wait_maximum_players_1")}
												<img
													src={` /images/Headset_condition/Headset_condition_connecting.png`}
													alt=""
													className="size-5 ml-2 animate-spin"
												/>
											</p>

											<div className="flex justify-center space-x-2 gap-10 mb-4 mt-4 ">
												<div>
													<img
														src={` /images/Buttons/Button_play.png`}
														className="cursor-pointer size-[6dvh] hover:scale-110 transition-transform duration-200"
														onClick={handlePlayPause}
														alt=""
													/>
													{/* <img src={` /images/Headset_condition/Headset_condition_connecting.png`} alt="" className='size-[65px] ml-2 animate-spin absolute bottom-[5px] right-[280px] '/> */}
												</div>

												<Link to={"../streamPlayerScreen"} className="rounded-lg" target="_blank">
													<img
														src={` /images/Buttons/Button_Display.png`}
														alt="display button"
														className="size-[6dvh] hover:scale-110 transition-transform duration-200"
													/>
												</Link>
											</div>
										</> // Autostart simulation — handled by useEffect above
									) : (
										<p className="flex items-center w-fit">
											{t("all_players_connected")}
											<img
												src={`/images/Headset_condition/Headset_condition_connected.png`}
												alt=""
												className="size-5 ml-2"
											/>
										</p>
									)
								) : (
									<div className="flex justify-center space-x-2 gap-10 mb-4 mt-4">
										{gama.experiment_state === "PAUSED" && (
											<img
												src={` /images/Buttons/Button_play.png`}
												alt="play button"
												onClick={handlePlayPause}
												className="cursor-pointer size-[6dvh] hover:scale-110 transition-transform duration-200"
											/>
										)}
										{(gama.experiment_state === "RUNNING" || gama.experiment_state === "LAUNCHING") && (
											<img
												src={` /images/Buttons/Button_pause.png`}
												alt="play button"
												onClick={handlePlayPause}
												className="cursor-pointer size-[6dvh] hover:scale-110 transition-transform duration-200"
											/>
										)}
										<img
											src={` /images/Buttons/Button_stop.png`}
											alt=""
											onClick={handleEnd}
											className="cursor-pointer size-[6dvh] hover:scale-110 transition-transform duration-200"
										/>
										<Link to={"../streamPlayerScreen"} className=" rounded-lg">
											<img
												src={` /images/Buttons/Button_Display.png`}
												alt="streaming displays button"
												className="cursor-pointer hover:scale-110 transition-transform duration-200 size-[6dvh]"
											/>
										</Link>
									</div>
								)}
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
