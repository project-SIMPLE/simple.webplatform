import net from "node:net";

/**
 * Whether `port` is already bound on `host` by another socket. `host` must match the one the
 * real server will listen on: omitted means Node's dual-stack `::`, like a uWS `listen(port)`.
 *
 * uWS can't be trusted to report this itself: it sets SO_REUSEADDR, which on Windows lets it
 * silently bind a port another process is still listening on — connections then reach the old
 * socket and the new server never sees them. A short-lived Node listener does fail with EADDRINUSE.
 */
export function isPortInUse(port: number, host?: string): Promise<boolean> {
	return new Promise((resolve) => {
		const probe = net.createServer();
		// Other errors (e.g. EACCES) are left for the real server to report
		probe.once("error", (e: NodeJS.ErrnoException) => resolve(e.code === "EADDRINUSE"));
		probe.listen({ port, host, exclusive: true }, () => probe.close(() => resolve(false)));
	});
}
