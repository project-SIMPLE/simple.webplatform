import uWS, {TemplatedApp} from 'uWebSockets.js';

import {useExtraVerbose, useVerbose, useAggressiveDisconnect} from './index.js';
import {PlayerJson, JsonOutput, PlayerState, JsonMonitor} from "./constants.ts";
import Controller from "./controller.ts";
import {clearInterval} from "node:timers";


// Override the log function
const log = (...args: any[]) => {
    // Add your custom functionality here
    console.log("\x1b[34m[PLAYER MANAGER]\x1b[0m", ...args);
};
const error = (...args: any[]) => {
    // Add your custom functionality here
    console.error("\x1b[34m[PLAYER MANAGER]\x1b[0m", "\x1b[41m", ...args, "\x1b[0m");
};

export interface Player {
    id: string,
    // Player Socket
    ws: uWS.WebSocket<unknown>,
    ping_interval: number,
    is_alive: boolean,
    timeout?: NodeJS.Timeout,
    // Player State
    connected: boolean,
    in_game: boolean,
    date_connection: string,
}

/**
 * Creates a websocket server to handle player connections
 */
class PlayerManager {
    controller: Controller;

    webSocketServer: TemplatedApp;

    //playerList: Map<IP ADDRESS, Player>;
    playerList: Map<string, Player>;

    /**
     * Creates a Websocket Server
     * @param {any} controller - The controller of the project
     */
    constructor(controller: Controller) {
        this.controller = controller;
        this.playerList = new Map<string, Player>()

        this.webSocketServer = uWS.App(
        ).listen(Number(process.env.HEADSET_WS_PORT), (token) => {
            if (token) {
                log(`Creating monitor server on: ws://0.0.0.0:${Number(process.env.HEADSET_WS_PORT)}`);
            } else {
                error('Failed to listen on the specified port', process.env.HEADSET_WS_PORT);
            }
        }).ws('/*', {
            compression: uWS.SHARED_COMPRESSOR, // Enable compression
            // Maximum length of *received* message.
            //maxPayloadLength: 16 * 1024,
            //idleTimeout: 30, // 30 seconds timeout
            open: (ws) => {
                const playerIP = Buffer.from(ws.getRemoteAddressAsText()).toString();

                // Check if known player or not
                if ( this.playerList.has(playerIP) ) {
                    const player: Player = this.playerList.get( playerIP )!;

                    log('[PLAYER MANAGER] Reconnection of the player of id ' + player.id);
                    player.ws = ws;
                    player.connected = true;
                    player.is_alive = true;
                    player.date_connection = `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`;


                    // Add in simulation if game already started and player is reconnecting
                    if (!player.in_game) {
                        this.addPlayerConnection(playerIP, true);
                    }

                    // Restart ping interval
                    player.timeout = setInterval(() => this.sendHeartbeat(playerIP), 5000);

                    // Update new version of player
                    this.playerList.set( playerIP, player );

                    this.notifyPlayerChange(playerIP);
                    this.controller.notifyMonitor();
                } else {
                    if (useVerbose) log(`New ws connection from ${playerIP}, waiting for connection message...`);
                    if (useExtraVerbose) log(ws.toString());
                }
            },

            // ======================================

            message: (ws, message) => {
                const playerIP = Buffer.from(ws.getRemoteAddressAsText()).toString();

                const jsonPlayer: PlayerJson = JSON.parse(Buffer.from(message).toString());
                const type = jsonPlayer.type;

                switch (type) {
                    case "pong":
                        this.playerList.get(playerIP)!.is_alive = true;
                        break;

                    case "ping":
                        ws.send(JSON.stringify({
                            type: "pong",
                            id: jsonPlayer.id
                        }), false, true); // not binary, compress
                        break;

                    case "connection":
                        if ( ! this.playerList.has(playerIP) ) {
                            log('New connection of the player of id ' + jsonPlayer.id);
                            // Create new player in the list
                            this.playerList.set(playerIP, {
                                id: jsonPlayer.id,
                                ws: ws,
                                ping_interval: jsonPlayer.heartbeat || 5000,
                                is_alive: true,
                                connected: false,
                                in_game: false,
                                date_connection: "",
                            })

                            this.addPlayerConnection(playerIP, true);

                            // Trigger heartbeat
                            this.playerList.get(playerIP)!.timeout = setInterval(() => this.sendHeartbeat(playerIP), jsonPlayer.heartbeat || 5000);

                            this.notifyPlayerChange(playerIP);
                            this.controller.notifyMonitor();
                        } // Reconnection managed on WS opening
                        break;

                    // case "restart":
                    //     // Restart the headset logic
                    //     break;

                    case "expression":
                        if (useExtraVerbose) log("\x1b[34m[PLAYER " + this.playerList.get(playerIP)!.id + "]\x1b[0m", "Sent expression:", jsonPlayer.expr);
                        this.controller.sendExpression(this.playerList.get(playerIP)!.id, jsonPlayer.expr!);
                        break;

                    case "ask":
                        if (useExtraVerbose) log("\x1b[34m[PLAYER " + this.playerList.get(playerIP)!.id + "]\x1b[0m", "Sent ask:", jsonPlayer);
                        this.controller.sendAsk(jsonPlayer);
                        break;

                    case "disconnect_properly":
                        ws.end(1000, playerIP);
                        this.controller.purgePlayer(this.playerList.get(playerIP)!.id);
                        break;

                    default:
                        console.warn("\x1b[31m[PLAYER MANAGER] The last message received from " + this.playerList.get(playerIP)!.id + " had an unknown type.\x1b[0m");
                        console.warn(jsonPlayer);
                }

                // Client is alive as he just communicated
                if (this.playerList.has(playerIP))
                    this.playerList.get(playerIP)!.is_alive = true;
            },

            // ======================================

            close: (ws, code: number, message) => {
                let playerIP!: string;
                try {
                    playerIP = Buffer.from(ws.getRemoteAddressAsText()).toString();
                } catch (e) {
                    playerIP = Buffer.from(message).toString();
                }

                try {
                    log(`Connection closed with ${this.playerList.get(playerIP)!.id} - ${playerIP}.\n\tCode: ${code}`,
                        (code != 1000) ? `, Reason: ${Buffer.from(message).toString()}` : "");

                    if (useVerbose) log("Flagging player as disconnected");
                    this.playerList.get(playerIP)!.connected = false;
                    clearInterval(this.playerList.get(playerIP)!.timeout);

                    // Handle specific close codes
                    switch (code) {
                        case 1003:
                            error('Unsupported data sent by the client.');
                            error('Message :', message);
                            break;

                        case 1006:
                        case 1009:
                            error('Message too big!');
                            if (message) {
                                error(`${playerIP} - Message :`, Buffer.from(message).toString());
                                if (typeof message.byteLength !== 'undefined') {
                                    error('Message size:', message.byteLength, 'bytes');
                                }
                            }
                            break;

                        default:
                            if (code !== 1000) // 1000 = Normal Closure
                                error('Unexpected closure');
                            else
                                if (useVerbose) log('Closing normally');
                    }
                } catch (err) {
                    error('Error during close handling:', err);
                }

                this.controller.notifyMonitor();
            }
        });
    }

    // Getters
    getPlayerById(id: string): Player | undefined {
        let toReturn = undefined;
        for (const [, player] of this.playerList) {
            if (player.id === id) {
                toReturn = player;
                break;
            }
        }
        if (toReturn == undefined) error("Cannot find player with ID" + id);

        return toReturn;
    }

    getIndexByPlayerId(id: string): string | undefined {
        let toReturn = undefined;
        for (const [key, player] of this.playerList) {
            if (player.id === id) {
                toReturn = key;
                break;
            }
        }
        if (toReturn == undefined) error("Cannot find player with ID" + id);

        return toReturn;
    }

    /**
     * Gets the state of a specific player
     * @param {string} idPlayer - Player ID
     * @returns {PlayerState} - The state of the player
     */
    getPlayerState(idPlayer: string): PlayerState {
        const player: Player = this.getPlayerById(idPlayer)!;
        return {connected: player.connected, in_game: player.in_game, date_connection: player.date_connection}
    }

    /**
     * Gets array with all players under a format which can be JSON.stringify
     * Removed attribute `ws` which is very verbose and not necessary
     */
    getArrayPlayerList() {
        // Turn Map to a dictionnary
        // Remove very verbose `ws` attribute
        return Object.fromEntries(
            Array.from(this.playerList.entries()).map(
                ([, value]) => [value.id, { ...value, timeout: undefined, ws: undefined }]
            )
        );
    }

    // Managing Player list

    /**
     * Sets the connection state of a player
     * @param {string} ipPlayer - Player ID
     * @param {boolean} connected - Connection status
     */
    addPlayerConnection(ipPlayer: string, connected: boolean) {
        this.playerList.get(ipPlayer)!.connected = connected;
        this.playerList.get(ipPlayer)!.date_connection = `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`;

        if ( !['NONE', "NOTREADY"].includes(this.controller.gama_connector.jsonGamaState.experiment_state) ) {
            if (useVerbose) log("Adding player " + this.playerList.get(ipPlayer)!.id + " to GAMA simulation...");
            this.controller.addInGamePlayer(ipPlayer);
            this.togglePlayerInGame(ipPlayer, true);
        }
    }

    /**
     * Withdraws a player
     * @param {string} idPlayer - Player ID
     */
    removePlayer(idPlayer: string) {
        if (useVerbose) log("Deleting player", idPlayer);

        // Manage both working with Player ID or Player IP
        const playerIP: string = this.playerList.has(idPlayer) ? idPlayer : this.getIndexByPlayerId(idPlayer)!;

        if ( this.playerList.has(playerIP) ) {
            // Properly close web socket
            this.playerList.get(playerIP)!.ws.end(1000, playerIP);

            if (useAggressiveDisconnect) {
                log("Aggressively deleting player");
                // Remove player
                this.playerList.delete(playerIP);
            }
        }
    }

    closePlayerWS(ipPlayer: string) {
        this.playerList.get(ipPlayer)!.connected = false;
        this.playerList.get(ipPlayer)!.ws.end(1000, ipPlayer);
    }

    // Interact with Player
    /**
     * Sets the in-game status of a player
     * @param {string} idPlayer - Player ID
     * @param {boolean} inGame - In-game status
     */
    togglePlayerInGame(idPlayer: string, inGame: boolean) {
        const playerIP: string = this.playerList.has(idPlayer) ? idPlayer : this.getIndexByPlayerId(idPlayer)!;

        if (this.playerList.has(playerIP)) {
            this.playerList.get(playerIP)!.in_game = inGame;
            this.notifyPlayerChange(playerIP);
        } else {
            error("Something strange happened while try to change in_game status for", idPlayer, inGame);
        }
    }

    /**
     * Sets all players' in-game status to false
     */
    removeAllPlayerInGame() {
        for (const [idPlayer] of this.playerList) {
            this.togglePlayerInGame(idPlayer, false)
        }
    }

    addEveryPlayer(): void {
        for (const [ipPlayer, player] of this.playerList) {

            if (!player.in_game){
                this.controller.gama_connector.addInGamePlayer(player.id);
                this.togglePlayerInGame(ipPlayer, true);
            }
        }
    }

    /**
     * Automatically send Heartbeat ping message to every player's open websocket
     */
    sendHeartbeat(ipPlayer: string): void {
        // Stop pinging if player already disconnected
        if(!this.playerList.has(ipPlayer) || !this.playerList.get(ipPlayer)!.connected) {
            if (useVerbose) log(ipPlayer + " is already disconnected, stop pinging...");
            if (this.playerList.has(ipPlayer)) clearInterval(this.playerList.get(ipPlayer)!.timeout);
            return;
        }

        const player: Player = this.playerList.get(ipPlayer)!;

        if (!player.is_alive) {
            console.warn('Terminating dead socket from ' + player.id);
            this.closePlayerWS(ipPlayer);
            this.controller.notifyMonitor();
        }

        this.playerList.get(ipPlayer)!.is_alive = false;
        player.ws.send(JSON.stringify({ type: "ping" }), false, true);

        if (useVerbose) log("Sending ping to " + player.id);
    }

    /**
     * Send the json_simulation to the players. It separates the json to send only the necessary information to the players.
     * @returns
     */
    broadcastSimulationOutput(jsonOutput: JsonOutput) {
        if (!jsonOutput.contents) return;

        try {
            jsonOutput.contents.forEach((element) => {
                element.id.forEach((idPlayer) => {
                    const playerIp: string | undefined = this.getIndexByPlayerId(idPlayer);
                    if (playerIp !== undefined) {
                        const jsonOutputPlayer = {
                            contents: element.contents,
                            type: "json_output"
                        };
                        this.playerList.get(playerIp)!.ws.send(JSON.stringify(jsonOutputPlayer), false, true);
                    }
                });
            });
        } catch (exception) {
            error("\x1b[31m[PLAYER MANAGER] The following message hasn't the correct format:\x1b[0m");
            error(jsonOutput);
        }
    }

    /**
     * Notifies players about a change in their state
     * @param {number} ipPlayer - The id of the player that needs to be informed about a change
     * @param {object} jsonPlayer - The jsonPlayer to be sent
     */
    notifyPlayerChange(ipPlayer: string) {
        if (this.playerList.has(ipPlayer)) {
            const jsonPlayer: Player = this.playerList.get(ipPlayer)!;

            const { ws, timeout, ...newJsonPlayer } = jsonPlayer!;

            const jsonStatePlayer = {
                type: "json_state",
                id_player: jsonPlayer!.id
            };

            jsonPlayer!.ws.send(JSON.stringify({...jsonStatePlayer, ...newJsonPlayer}), false, true);
            if (useVerbose) log(`\x1b[34m[DEBUG Player ${jsonPlayer!.id}]\x1b[0m`, `Sending state update ${JSON.stringify({...jsonStatePlayer, ...newJsonPlayer})}`);
        }
    }

    close() {
        // Notify players that they are removed
        for (const [, value] of this.playerList) {
            this.removePlayer(value.id)
        }

        this.controller.notifyMonitor();

        this.webSocketServer.close();
    }
}

export default PlayerManager;
