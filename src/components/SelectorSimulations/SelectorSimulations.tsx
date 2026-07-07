import { getLogger } from "@logtape/logtape";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { wsApi } from "../../common/wsApi";
import { useSimulationNav } from "../../hooks/useSimulationNav";
import Footer from "../Footer/Footer";
import Header from "../Header/Header";
import { useWebSocket } from "../WebSocketManager/WebSocketManager";
import SimulationList from "./SimulationList";

const SelectorSimulations = () => {
	const { ws, isWsConnected, gamaless, gama, simulationList } = useWebSocket();
	const { subProjectsList, path, back, reset, handleSimulation } = useSimulationNav();
	const [loading, setLoading] = useState<boolean>(true);
	const [connectionStatus, setConnectionStatus] = useState<string>("Waiting for connection ...");
	const { t } = useTranslation();
	const logger = getLogger(["components", "SelectorSimulation"]);

	useEffect(() => {
		if (isWsConnected && ws !== null) {
			wsApi.getSimulationInformations(ws);
			setLoading(true);
		}
	}, [isWsConnected, ws]);

	useEffect(() => {
		if (simulationList.length > 0) {
			setLoading(false);
		}
	}, [simulationList]);

	// Loop which tries to connect to Gama (skipped in GAMALESS mode)
	useEffect(() => {
		if (gamaless) return;
		let interval: NodeJS.Timeout;
		if (ws && !gama.connected) {
			interval = setInterval(() => {
				// Guard against a stale ws reference — the socket may have closed between
				// the time this interval was set up and now (e.g. during HMR or reconnect).
				if (ws.readyState !== WebSocket.OPEN) return;
				wsApi.tryConnection(ws);
				logger.info("Trying to connect to GAMA, connection status: {gamaStatus}", { gamaStatus: gama.connected });
			}, 3000);
		}
		return () => {
			clearInterval(interval);
		};
	}, [ws, gama.connected, gamaless, logger.info]);

	// Display connexion status
	useEffect(() => {
		if (gama.connected) {
			setConnectionStatus("");
		} else {
			setConnectionStatus(t("loading")); // Pass the translated string directly
		}
	}, [gama.connected, t]);

	return (
		<div className="flex flex-col items-center justify-between h-full">
			<Header onLogoClick={reset} />
			{/* ↑ prop to specify whether it should use the small version of the navigation bar */}

			{gamaless ? (
				<>
					<div className="bg-yellow-100 border-4 border-yellow-500 rounded-xl px-8 py-6 text-center max-w-lg">
						<h2 className="text-2xl font-bold text-yellow-700 mb-2">GAMALESS Mode</h2>
						<p className="text-yellow-800">Simulation features are disabled. No GAMA server is connected.</p>
						<p className="text-yellow-700 mt-2 text-sm">Headset management is still operational.</p>
					</div>
					<Link to={"../streamPlayerScreen"} className="rounded-lg" target="_blank">
						<img src={` /images/Buttons/Button_Display.png`} alt="display button" className="size-[6dvh]" />
					</Link>
				</>
			) : loading ? (
				<div className="text-center">
					<div className="animate-pulse ease-linear rounded-full border-8 border-t-8 border-gray-200 h-24 w-24 mb-4 -z-50"></div>
					<h2 className="text-gray-700">{t("loading")}</h2>
				</div>
			) : (
				<div className="flex flex-col justify-center items-center size-full rounded-md relative">
					{
						//? Shows the back button if in a nested folder
						path.length >= 1 && (
							<img
								src={` /images/Buttons/Button_back.png`}
								alt="back button"
								onClick={() => back()}
								className="cursor-pointer size-[6dvh] hover:scale-110 transition-transform duration-200 absolute left-[3.1dvw] top-10 "
							/>
						)
					}

					<div className="flex flex-col items-center justify-around h-fit w-full relative">
						<SimulationList list={subProjectsList} handleSimulation={handleSimulation} gama={gama} />
					</div>
					<Link to={"../streamPlayerScreen"} className="rounded-lg absolute bottom-[10dvh]" target="_blank">
						<img
							src={` /images/Buttons/Button_Display.png`}
							alt=""
							className="size-[6dvh] hover:scale-110 transition-transform duration-200"
						/>
					</Link>
					{/* Display the status, ask for the user to connect to Gama if still not */}
					<div className="flex gap-2 mt-6">
						<div className={gama.connected ? "text-green-500" : "text-red-500"}>
							{gama.connected ? "" : connectionStatus}
						</div>
					</div>
				</div>
			)}
			<Footer />
		</div>
	);
};

export default SelectorSimulations;
