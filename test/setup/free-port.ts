import net from "node:net";

/**
 * Ask the OS for a free TCP port (bind :0, read the assigned port, release it).
 * Used to start the real uWS servers on a non-colliding port per test.
 */
export function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const srv = net.createServer();
		srv.once("error", reject);
		srv.listen(0, "127.0.0.1", () => {
			const address = srv.address();
			const port = typeof address === "object" && address ? address.port : 0;
			srv.close(() => resolve(port));
		});
	});
}
