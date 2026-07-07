import { getLogger } from "@logtape/logtape";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { VU_CATALOG_SETTING_JSON, VU_MODEL_SETTING_JSON } from "../common/types";
import { wsApi } from "../common/wsApi";
import { useWebSocket } from "../components/WebSocketManager/WebSocketManager";

type SimulationEntry = VU_CATALOG_SETTING_JSON | VU_MODEL_SETTING_JSON;

/**
 * Catalog-navigation state for the simulation selector.
 * Owns the nested-folder `path` and the derived `subProjectsList`, and handles
 * either descending into a catalog or launching a simulation on selection.
 * Connection-status polling stays in the component — it is a connection concern,
 * not a navigation one.
 */
export const useSimulationNav = () => {
	const { ws, isWsConnected, simulationList } = useWebSocket();
	const navigate = useNavigate();
	const logger = getLogger(["hooks", "useSimulationNav"]);

	const [subProjectsList, setSubProjectsList] = useState<SimulationEntry[]>(simulationList);
	const [path, setPath] = useState<number[]>([]);

	useEffect(() => {
		if (simulationList && simulationList.length > 0) {
			setSubProjectsList(simulationList);
		}
	}, [simulationList]);

	useEffect(() => {
		// the path here is a list of nested indexes, which are used to see which catalogs the user clicked
		if (!Array.isArray(simulationList)) {
			logger.warn("simulationList is not an array, resetting subProjectsList");
			setSubProjectsList([]);
			return;
		}
		if (path.length > 0) {
			let list: SimulationEntry[] = simulationList;
			for (const index of path) {
				logger.debug("index in the use effect: {index}", { index });
				if (!Array.isArray(list)) {
					logger.error("Expected list to be an array during path traversal");
					break;
				}
				const entry = list[index];
				if (entry?.type === "catalog" && Array.isArray((entry as VU_CATALOG_SETTING_JSON).entries)) {
					list = (entry as VU_CATALOG_SETTING_JSON).entries;
				} else if (entry) {
					list = [entry];
				} else {
					logger.error("Invalid path index {index}", { index });
					break;
				}
			}
			setSubProjectsList(list);
		} else {
			setSubProjectsList(simulationList);
		}
	}, [path, simulationList, logger.debug, logger.warn, logger.error]);

	/** Add a clicked subfolder index to the navigation path. */
	const addToPath = (index: number) => {
		setPath([...path, index]);
	};

	/** Remove the last index from the path, stepping back up one folder level. */
	const back = () => {
		if (path.length > 1) {
			setPath([...path.slice(0, -1)]);
		}
		if (path.length === 1) {
			setPath([]);
			setSubProjectsList([]);
		}
	};

	/** Reset navigation to the catalog root (used by the header logo click). */
	const reset = () => {
		setPath([]);
		setSubProjectsList(simulationList);
	};

	/**
	 * On selection: descend into a catalog, or send the chosen simulation to GAMA
	 * and navigate to the simulation manager.
	 */
	const handleSimulation = (index: number) => {
		if (!isWsConnected || ws === null) {
			logger.warn("Websocket not connected \n isWsConnected:{isWsConnected}\n ws:{ws}", { isWsConnected, ws });
			return;
		}

		const item = subProjectsList[index];

		if (item.type === "catalog") {
			const catalog_item = item as VU_CATALOG_SETTING_JSON;
			logger.debug("catalog detected, subprojectList:{subprojectList}", {
				subProjectList: JSON.stringify(catalog_item.entries),
			});
			try {
				setSubProjectsList(catalog_item.entries);
				addToPath(index);
				if (!catalog_item.splashscreen) {
					logger.warn("No splashscreen could be found for simulation {simulation}", { simulation: catalog_item.name });
				}
				logger.debug("called handle simulation, selected item is a catalog of name:{expName}", {
					expName: catalog_item.name,
				});
			} catch (e) {
				logger.error("no subprojects, ERROR:{e}", { e });
			}
		} else if (item.type === "json_settings") {
			wsApi.sendSimulation(ws, item);
			setTimeout(() => {
				navigate("/simulationManager");
			}, 100);
		}
	};

	return { subProjectsList, path, addToPath, back, reset, handleSimulation };
};
