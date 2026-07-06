import ReactDOM from "react-dom/client";
import "./i18next/i18n";
import "./index.css";
import { configure, getConsoleSink } from "@logtape/logtape";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import SelectorSimulations from "./components/SelectorSimulations/SelectorSimulations";
import SimulationManager from "./components/SimulationManager/SimulationManager";
import StreamFullscreen from "./components/StreamPlayerScreen/StreamFullscreen";
import StreamPlayerScreen from "./components/StreamPlayerScreen/StreamPlayerScreen";
import WebSocketManager from "./components/WebSocketManager/WebSocketManager";

await configure({
	sinks: {
		console: getConsoleSink({}),
	},
	loggers: [
		{
			category: [], // The empty array acts as a wildcard for all categories
			sinks: ["console"],
			lowestLevel: "debug", // Capture everything from debug and above
		},
		{ category: ["logtape", "meta"], sinks: ["console"], lowestLevel: "warning" },
	],
});

const App = () => {
	return (
		<BrowserRouter>
			<div
				className="h-full w-full bg-no-repeat bg-center bg-cover relative overflow-hidden"
				style={{ backgroundImage: `url( /images/Background.png)` }}
			>
				<WebSocketManager>
					<Routes>
						<Route index element={<SelectorSimulations />} />
						<Route path="simulationManager" element={<SimulationManager />} />
						<Route path="streamPlayerScreen" element={<StreamPlayerScreen />} />
						<Route path="streamFullscreen" element={<StreamFullscreen />}></Route>
					</Routes>
				</WebSocketManager>
			</div>
		</BrowserRouter>
	);
};

const container = document.getElementById("root")!;
const root = ReactDOM.createRoot(container);

root.render(<App />);
