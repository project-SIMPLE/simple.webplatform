import { getLogger } from "@logtape/logtape";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { PlayerState } from "../../common/types";
import { wsApi } from "../../common/wsApi";
import VRHeadset from "../VRHeadset/VRHeadset";
import { useWebSocket } from "../WebSocketManager/WebSocketManager";

const logger = getLogger(["components", "SimulationManagerPlayer"]);

interface PlayerProps {
	Playerkey: string;
	selectedPlayer?: PlayerState;
	className?: string;
	playerId?: string;
}

const SimulationManagerPlayer = ({ Playerkey, selectedPlayer, className, playerId }: PlayerProps) => {
	const { t } = useTranslation();

	const { ws } = useWebSocket();

	const [showPopUpManageHeadset, setshowPopUpManageHeadset] = useState(false);

	const toggleShowPopUpManageHeadset = () => {
		setshowPopUpManageHeadset(!showPopUpManageHeadset);
	};

	const handleRemove = (id: string) => {
		if (ws !== null) {
			logger.info("ID headset: {id}", { id });
			wsApi.removePlayerHeadset(ws, id);
			toggleShowPopUpManageHeadset();
		} else {
			logger.error("Websocket not connected");
		}
	};

	return (
		<>
			{showPopUpManageHeadset ? (
				<button
					type="button"
					className="fixed inset-0 flex items-center justify-center bg-slate-800 bg-opacity-75 z-10 w-full h-full cursor-default border-none"
					onClick={toggleShowPopUpManageHeadset}
				>
					<button
						type="button"
						className="rounded-md shadow-lg w-72 text-center z-20 cursor-default bg-transparent border-none"
						onClick={(e) => e.stopPropagation()}
					>
						{" "}
						{/*this prevent event bubbling, so that clicking the child div does not close the popup window*/}
						<div className="p-3 flex items-top bg-slate-300 rounded-t-md justify-between">
							<h2 className="text-lg font-semibold">
								{Playerkey}: {/* //TODO ajouter les traduction ici  */}
							</h2>
							<button
								type="button"
								onClick={toggleShowPopUpManageHeadset}
								className="bg-transparent border-none p-0 rounded-full hover:bg-gray-800 mix-blend-difference w-8 h-8 flex items-center justify-center"
							>
								<img src="/images/Buttons/Button_stop.png" alt="X" className={`w-8 h-8 cursor-pointer ${className}`} />
							</button>
						</div>
						<div className="bg-slate-200 p-2 text-left">
							<p>Player: {String(playerId)}</p>
							<p>
								{t("Status")} : {selectedPlayer ? String(selectedPlayer.connected) : "no selected player"}
							</p>
							<p>
								{t("Hour of connection")} : {selectedPlayer ? selectedPlayer.date_connection : "no selected player"}
							</p>
							<p>
								{t("In game")} : {selectedPlayer ? String(selectedPlayer.in_game) : "no selected player"}
							</p>
						</div>
						<div className="bg-red-300 pb-3 rounded-b-md">
							<button
								type="button"
								className="bg-red-500 text-white px-4 py-2 mt-4 rounded-l-md rounded-r-none"
								onClick={() => handleRemove(Playerkey)}
							>
								{t("remove")}
							</button>
							{/* bouton vers le mirror d ece casque spécifiquement */}
							<button
								type="button"
								className="bg-orange-500 text-white px-4 py-2 mt-4 rounded-r-md rounded-l-none disabled:opacity-50 disabled:cursor-not-allowed"
								disabled /* TODO: implement restart */
							>
								{t("relaunch")}
							</button>
						</div>
					</button>
				</button>
			) : null}

			<button
				type="button"
				className="flex flex-col rounded-xl hover:scale-105 items-center relative bg-transparent border-none p-0 cursor-default"
				onClick={toggleShowPopUpManageHeadset}
			>
				<VRHeadset key={Playerkey} selectedPlayer={selectedPlayer} playerId={Playerkey} />
				{selectedPlayer ? (
					selectedPlayer.connected ? (
						<img
							src={` /images/Headset_condition/Headset_condition_connected.png`}
							alt="headset connected"
							className="absolute size-8 right-0 bottom-0"
						/>
					) : (
						<img
							src={` /images/Headset_condition/Headset_condition_connecting.png`}
							className="absolute size-8 right-0 bottom-0 animate-spin"
							alt="headset connecting"
						/>
					)
				) : (
					<img
						src={` /images/Headset_condition/Headset_condition_not_connected.png`}
						className="absolute size-8 right-0 bottom-0"
						alt="headset disconnected"
					/>
				)}

				{/* <div className={`rounded-b-xl justify-center w-full ${selectedPlayer ? selectedPlayer.connected ? 'bg-green-500' : 'bg-red-500' : ""}`}>

          </div> */}
			</button>
		</>
	);
};

export default SimulationManagerPlayer;
