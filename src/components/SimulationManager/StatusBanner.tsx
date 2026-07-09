import { useTranslation } from "react-i18next";

interface StatusBannerProps {
	gamaless: boolean;
	experimentState: string;
	playerCount: number;
	minPlayers: string | number;
	maxPlayers: string | number;
}

/**
 * State/waiting message for the SimulationManager screen: the GAMALESS banner, the
 * waiting-for-min / waiting-for-max messages, or "all players connected". Renders null
 * once the experiment is running/paused/launching.
 */
const StatusBanner = ({ gamaless, experimentState, playerCount, minPlayers, maxPlayers }: StatusBannerProps) => {
	const { t } = useTranslation();

	if (gamaless) {
		return (
			<div className="mt-4 px-4 py-2 bg-yellow-100 border-2 border-yellow-400 rounded-lg text-yellow-800 text-sm text-center">
				GAMALESS — simulation controls disabled
			</div>
		);
	}

	// Messages only apply before the experiment starts.
	if (experimentState !== "NONE" && experimentState !== "NOTREADY") {
		return null;
	}

	if (playerCount < Number(minPlayers)) {
		return (
			<p className="flex items-center align-center" style={{ marginLeft: "90px" }}>
				{t("wait_minim_players_1")} {Number(minPlayers) - playerCount} {t("wait_minim_players_2")}
				<img
					src={` /images/Headset_condition/Headset_condition_connecting.png`}
					className="size-8 right-0 bottom-0 animate-spin"
					alt="headset connecting"
				/>
			</p>
		);
	}

	if (playerCount >= Number(minPlayers) && playerCount < Number(maxPlayers)) {
		return (
			<p className="flex items-center w-fit">
				{t("wait_minim_players_1")} {Number(maxPlayers) - playerCount} {t("wait_maximum_players_1")}
				<img
					src={` /images/Headset_condition/Headset_condition_connecting.png`}
					alt=""
					className="size-5 ml-2 animate-spin"
				/>
			</p>
		);
	}

	// count >= max: all connected (autostart is handled by useGamaExperiment).
	return (
		<p className="flex items-center w-fit">
			{t("all_players_connected")}
			<img src={`/images/Headset_condition/Headset_condition_connected.png`} alt="" className="size-5 ml-2" />
		</p>
	);
};

export default StatusBanner;
