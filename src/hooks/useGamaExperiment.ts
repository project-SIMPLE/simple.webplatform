import { getLogger } from "@logtape/logtape";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { wsApi } from "../common/wsApi";
import { useWebSocket } from "../components/WebSocketManager/WebSocketManager";

/**
 * Experiment-control logic for the SimulationManager screen.
 * Owns the launch/resume/pause/stop actions, the one-shot auto-start when the
 * detected headset count reaches the maximum, and navigation home when GAMA
 * ends the experiment (via the Stop button or externally). Also returns the
 * derived player/simulation values the view renders, so the component stays
 * layout-only.
 */
export const useGamaExperiment = () => {
	const logger = getLogger(["hooks", "useGamaExperiment"]);
	const { ws, gamaless, gama, playerList, selectedSimulation } = useWebSocket();
	const navigate = useNavigate();
	const [simulationStarted, setSimulationStarted] = useState(false);

	// Comparaison between players from the simulationList and the maximal/minimal players
	const detectedPlayers = Object.keys(playerList); // List Detected Players
	const maxPlayers = selectedSimulation?.maximal_players || 0;
	const minPlayers = selectedSimulation?.minimal_players || 0;

	// Navigate back to home when GAMA closes the experiment from its side
	// (mirrors the behaviour of the Stop button, which calls navigate('/') immediately)
	const prevExperimentStateRef = useRef<string>(gama.experiment_state);
	useEffect(() => {
		const prev = prevExperimentStateRef.current;
		prevExperimentStateRef.current = gama.experiment_state;

		if (
			!gamaless &&
			simulationStarted &&
			["RUNNING", "PAUSED", "LAUNCHING"].includes(prev) &&
			["NONE", "NOTREADY"].includes(gama.experiment_state)
		) {
			navigate("/");
		}
	}, [gamaless, simulationStarted, gama.experiment_state, navigate]);

	// Auto-start simulation when max players reached — only fires once per session
	useEffect(() => {
		if (
			!gamaless &&
			!simulationStarted &&
			gama.experiment_state === "NONE" &&
			detectedPlayers.length >= Number(maxPlayers) &&
			Number(maxPlayers) > 0 &&
			ws !== null
		) {
			setSimulationStarted(true);
			logger.debug("sent message {type: launch experiment}");
			wsApi.launchExperiment(ws);
		}
	}, [gamaless, simulationStarted, gama.experiment_state, detectedPlayers.length, maxPlayers, ws, logger.debug]);

	const handlePlayPause = () => {
		if (ws !== null) {
			if (gama.experiment_state === "NONE" && !simulationStarted) {
				setSimulationStarted(true);
				logger.debug("sent message {type: launch experiment}");
				wsApi.launchExperiment(ws);
			} else if (gama.experiment_state !== "NOTREADY") {
				if (gama.experiment_state !== "RUNNING") {
					wsApi.resumeExperiment(ws);
				} else {
					wsApi.pauseExperiment(ws);
				}
			}
		} else {
			logger.error("WS is null");
		}
	};

	const handleEnd = () => {
		if (ws !== null) {
			wsApi.stopExperiment(ws);
			//  redirect to the main page :
			navigate("/");
		} else {
			logger.error("WS is null");
		}
	};

	useEffect(() => {
		if (!gamaless && !selectedSimulation) {
			navigate("/");
		}
	}, [gamaless, selectedSimulation, navigate]);

	return {
		gama,
		gamaless,
		playerList,
		selectedSimulation,
		detectedPlayers,
		maxPlayers,
		minPlayers,
		simulationStarted,
		handlePlayPause,
		handleEnd,
	};
};
