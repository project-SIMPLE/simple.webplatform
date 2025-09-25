import uWS, {TemplatedApp} from 'uWebSockets.js';

import {ENV_EXTRA_VERBOSE, ENV_AGGRESSIVE_DISCONNECT} from '../index.ts';
import {JsonPlayer, JsonOutput, PlayerState, Player, JsonPlayerAsk} from "../core/Constants.ts";
import Controller from "../core/Controller.ts";
import {clearInterval} from "node:timers";
import {getLogger} from "@logtape/logtape";


// Override the log function
const logger= getLogger(["multi", "PlayerManager"]);

/**
 * Creates a websocket server to handle player connections
 */
class PlayerManager {
    controller: Controller;

    webSocketServer: TemplatedApp;

    //playerList: Map<WS ID/IP ADDRESS, Player>;
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
                logger.info(`Creating monitor server on: ws://0.0.0.0:${Number(process.env.HEADSET_WS_PORT)}`);
                logger.debug("{token}", {token});
            } else {
                logger.error(`Failed to listen on the specified port ${process.env.HEADSET_WS_PORT}`);
            }
        }).ws('/*', {
            // Server doesn't compress yet
            // WebSocketSharp (Unity side) doesn't support deflating messages
            // https://github.com/sta/websocket-sharp/issues/580
            //: (uWS.SHARED_COMPRESSOR | uWS.SHARED_DECOMPRESSOR),

            open: (ws) => {
                const playerWsId: string = Buffer.from(ws.getRemoteAddressAsText()).toString();

                // Check if known player or not
                if ( this.playerList.has(playerWsId) ) {
                    const player: Player = this.playerList.get( playerWsId )!;

                    logger.info(`Reconnection of the player of id ${player.id}`);
                    player.ws = ws;
                    player.connected = true;
                    player.is_alive = true;
                    player.date_connection = `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`;


                    // Add in simulation if game already started and player is reconnecting
                    if (!player.in_game) {
                        this.addPlayerConnection(playerWsId, true);
                    }

                    // Restart ping interval
                    player.timeout = setInterval(() => this.sendHeartbeat(playerWsId), player.ping_interval);

                    // Update new version of player
                    this.playerList.set( playerWsId, player );

                    this.notifyPlayerChange(playerWsId);
                    this.controller.notifyMonitor();
                } else {
                    logger.debug(`New ws connection from ${playerWsId}, waiting for connection message...`);
                    logger.trace(ws.toString());
                }
            },
            // ======================================

            message: (ws, message) => {
                const playerIP = Buffer.from(ws.getRemoteAddressAsText()).toString();
                const jsonPlayer: JsonPlayer = JSON.parse(Buffer.from(message).toString());

                // Alive as received any message
                if (this.playerList.has(playerIP))
                    this.playerList.get(playerIP)!.is_alive = true;

                switch (jsonPlayer.type) {
                    case "pong":
                        this.playerList.get(playerIP)!.is_alive = true;
                        break;

                    case "ping":
                        this.sendMessageByWs(playerIP, {
                            type: "pong",
                            id: jsonPlayer.id
                        });
                        break;

                    case "connection":
                        if ( ! this.playerList.has(playerIP) ) {
                            logger.info('New connection of the player of id ' + jsonPlayer.id);
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
                        logger.trace(`[PLAYER ${this.playerList.get(playerIP)!.id}] Sent expression: {json}`, {json: jsonPlayer.expr });
                        this.controller.sendExpression(this.playerList.get(playerIP)!.id, jsonPlayer.expr!);
                        break;

                    case "ask":
                        const askJsonPlayer: JsonPlayerAsk = JSON.parse(Buffer.from(message).toString());
                        logger.trace(`[PLAYER ${this.playerList.get(playerIP)!.id}] Sent expression: {json}`, {json: askJsonPlayer });
                        this.controller.sendAsk(askJsonPlayer);
                        break;

                    case "disconnect_properly":
                        ws.end(1000, playerIP);
                        this.controller.purgePlayer(this.playerList.get(playerIP)!.id);
                        break;

                    default:
                        logger.warn(`The last message received from ${this.playerList.get(playerIP)!.id} had an unknown type\n{json}`, {json: jsonPlayer});
                }

                // Client is alive as he just communicated
                if (this.playerList.has(playerIP))
                    this.playerList.get(playerIP)!.is_alive = true;
            },

            // ======================================

            close: (ws, code: number, message) => {
                let playerIP!: string;
                try {
                    playerIP = this.getIndexByPlayerWs(ws)!;
                } catch (e) {
                    logger.warn("Can't find player from websocket, trying fallback method...")
                    logger.trace("{e}", {e});
                    try {
                        playerIP = Buffer.from(ws.getRemoteAddressAsText()).toString();
                    } catch (e) {
                        playerIP = Buffer.from(message).toString();
                    }
                }

                if (playerIP == "" || playerIP == undefined)
                    logger.error("Can't find which WebSocket been closed...");
                else try {
                    logger.info(`Connection closed with ${this.playerList.get(playerIP)!.id} - ${playerIP}.\n\tCode: ${code}`);
                    (code != 1000) ? logger.info(`, Reason: ${Buffer.from(message).toString()}`) : "";

                    logger.debug("Flagging player as disconnected");
                    this.playerList.get(playerIP)!.connected = false;
                    clearInterval(this.playerList.get(playerIP)!.timeout);

                } catch (err) {
                    logger.error('Error during close handling: {err}', {err});
                }

                // Handle specific close codes
                switch (code) {
                    case 1003:
                        logger.error(`[Err ${code}] Unsupported data sent by the client.\nMessage: {message}`, {message});
                        break;

                    case 1006:
                        logger.error(`[Err ${code}] Abnormal websocket closure with message: ${Buffer.from(message).toString()}`);
                        break;

                    case 1009:
                        logger.error(`[Err ${code}] Message too big!`);
                        if (message) {
                            try {
                                logger.error(`${playerIP} - Message: ${Buffer.from(message).toString()}`);
                                if (typeof message.byteLength !== 'undefined') {
                                    logger.error(`Message size: ${message.byteLength} bytes`);
                                }
                            } catch {}
                        }
                        break;

                    case 1005:
                        logger.warn(`[Err ${code}] Closed without reason; the game probably been closed in Unity IDE`);
                        break;

                    default:
                        if (code !== 1000) // 1000 = Normal Closure
                            logger.error(`[Err ${code}] Unexpected closure`);
                        else
                            logger.debug('Closing normally');
                }

                this.controller.notifyMonitor();
            }
        });
    }

    // Getters
    getIndexByPlayerId(id: string): string | undefined {
        let toReturn = undefined;
        for (const [key, player] of this.playerList) {
            if (player.id === id) {
                toReturn = key;
                break;
            }
        }
        if (toReturn == undefined) logger.error(`Cannot find player with ID ${id}}`);

        return toReturn;
    }

    getIndexByPlayerWs(ws: uWS.WebSocket<unknown>): string | undefined {
        let toReturn = undefined;
        for (const [key, player] of this.playerList) {
            if (player.ws === ws) {
                toReturn = key;
                break;
            }
        }
        if (toReturn == undefined) logger.error(`Cannot find player with WS ${ws}`);

        return toReturn;
    }

    /**
     * Gets the state of a specific player
     * @param {string} playerWsId - Player WS ID
     * @returns {PlayerState} - The state of the player
     */
    getPlayerState(playerWsId: string): PlayerState|void {
        if (this.playerList.has(playerWsId)){
            const player: Player = this.playerList.get(playerWsId)!;
            return {connected: player.connected, in_game: player.in_game, date_connection: player.date_connection}
        } else
            logger.warn(`Can't find player with ID ${playerWsId}`);
    }

    /**
     * Gets the in_game ID of a specific player
     * NB: The `playerWsId` is different from the in_game ID as the first one represent the IP address connecting to the mw
     * @param {string} playerWsId - Player ID
     * @returns {string} - The ID player
     */
    getPlayerId(playerWsId: string): string|void {
        if (this.playerList.has(playerWsId)){
            return this.playerList.get(playerWsId)!.id;
        } else
            logger.warn(`Can't find player with ws ID ${playerWsId}`);
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
     * @param {string} playerWsId - Player ID
     * @param {boolean} connected - Connection status
     */
    addPlayerConnection(playerWsId: string, connected: boolean) {
        this.playerList.get(playerWsId)!.connected = connected;
        this.playerList.get(playerWsId)!.date_connection = `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`;

        if ( !['NONE', "NOTREADY"].includes(this.controller.gama_connector.jsonGamaState.experiment_state) ) {
            logger.debug(`Adding player ${this.playerList.get(playerWsId)!.id} to GAMA simulation...`);
            this.controller.addInGamePlayer(playerWsId);
            this.togglePlayerInGame(playerWsId, true);
        }
    }

    /**
     * Withdraws a player
     * @param {string} playerWsId - Player ID
     */
    removePlayer(playerWsId: string) {
        logger.debug(`Deleting player ${playerWsId}`);

        // Manage both working with Player ID or Player IP
        const playerIP: string = this.playerList.has(playerWsId) ? playerWsId : this.getIndexByPlayerId(playerWsId)!;

        if ( this.playerList.has(playerIP) ) {
            try {
                // Properly close web socket
                this.playerList.get(playerIP)!.ws.end(1000, playerIP);
            } catch (e) {
                logger.warn(`${playerIP} is already disconnected from middleware\nFull log of player: {player}`, {player: this.playerList.get(playerIP)});
            }

            if (ENV_AGGRESSIVE_DISCONNECT) {
                logger.debug("Aggressively deleting player");
                // Remove player
                this.playerList.delete(playerIP);
            }
        } else {
            logger.warn(`Can't remove un-existing player ${playerIP}`);
        }
    }

    /**
     * Disconnect every players
     */
    removeAllPlayer() {
        logger.debug("Disconnect every player at once");

        for (const [playerWsId] of this.playerList) {
            this.removePlayer(playerWsId);
        }
    }

    closePlayerWS(playerWsId: string) {
        if(this.playerList.has(playerWsId)){
            this.playerList.get(playerWsId)!.connected = false;
            this.playerList.get(playerWsId)!.ws.end(1000, playerWsId);
        }
    }

    // Interact with Player
    /**
     * Sets the in-game status of a player
     * @param {string} playerWsId - Player ID
     * @param {boolean} inGame - In-game status
     */
    togglePlayerInGame(playerWsId: string, inGame: boolean) {
        const playerIP: string = this.playerList.has(playerWsId) ? playerWsId : this.getIndexByPlayerId(playerWsId)!;

        if (this.playerList.has(playerIP)) {
            this.playerList.get(playerIP)!.in_game = inGame;
            this.notifyPlayerChange(playerIP);
        } else {
            logger.error(`Something strange happened while try to change in_game status for ${playerWsId} ${inGame}`);
        }
    }

    /**
     * Sets all players' in-game status to false
     */
    disableAllPlayerInGame() {
        logger.debug("Change in-game status of every player at once");

        for (const [playerWsId] of this.playerList) {
            this.togglePlayerInGame(playerWsId, false)
        }
    }

    addEveryPlayer(): void {
        logger.debug("Add every player at once");

        for (const [playerWsId, player] of this.playerList) {

            if (!player.in_game){
                this.controller.gama_connector.addInGamePlayer(playerWsId);
                this.togglePlayerInGame(playerWsId, true);
            }
        }
    }

    /**
     * Automatically send Heartbeat ping message to every player's open websocket
     */
    sendHeartbeat(playerWsId: string): void {
        // Stop pinging if player already disconnected
        if(!this.playerList.has(playerWsId) || !this.playerList.get(playerWsId)!.connected) {
            logger.debug(`${playerWsId} is already disconnected, stop pinging...`);
            if (this.playerList.has(playerWsId)) clearInterval(this.playerList.get(playerWsId)!.timeout);
            return;
        } else if (!this.playerList.get(playerWsId)!.is_alive) { // Terminate ws of disconnected player
            logger.warn(`Terminating dead socket from ${this.playerList.get(playerWsId)!.id}`);
            this.closePlayerWS(playerWsId);
            this.controller.notifyMonitor();
            return;
        }

        this.playerList.get(playerWsId)!.is_alive = false;
        try {
            this.sendMessageByWs(playerWsId, { type: "ping" })
        } catch (e) {
            logger.error(`Error while sending ping to ${this.playerList.get(playerWsId)!.id})\n{e}`, {e});
        }
        logger.debug(`Sending ping to ${this.playerList.get(playerWsId)!.id}`);
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
                        this.sendMessageByWs(playerIp, jsonOutputPlayer);
                    }
                });
            });
        } catch (exception) {
            logger.error("The following message hasn't the correct format: {jsonOutput}", {jsonOutput});
        }
    }

    /**
     * Notifies players about a change in their state
     * @param {number} playerWsId - The id of the player that needs to be informed about a change
     */
    notifyPlayerChange(playerWsId: string) {
        if (this.playerList.has(playerWsId)) {
            const jsonPlayer: Player = this.playerList.get(playerWsId)!;

            const { ws, timeout, ...newJsonPlayer } = jsonPlayer!;

            const jsonStatePlayer = {
                type: "json_state",
                id_player: jsonPlayer!.id
            };

            this.sendMessageByWs(playerWsId, {...jsonStatePlayer, ...newJsonPlayer});
            logger.debug(`[Player ${jsonPlayer!.id}] Sending state update ${JSON.stringify({...jsonStatePlayer, ...newJsonPlayer})}`);
        }
    }

    /**
     *
     * @param playerWsId
     * @param message
     * @return Returns 1 for success, 2 for dropped due to backpressure limit, and 0 for built up backpressure that will drain over time.
     * @return -1 if playerWsId missing or not connected
     */
    sendMessageByWs(playerWsId: string, message: any): number {
        let jsonPlayer!: Player;
        if (this.playerList.has(playerWsId) && this.playerList.get(playerWsId)!.connected )
            jsonPlayer = this.playerList.get(playerWsId)!;
        else{
            if (ENV_EXTRA_VERBOSE)
                if (!this.playerList.has(playerWsId))
                     logger.error(`Missing player - Can't send a message to player ${playerWsId}`);
                else
                    logger.warn(`Disconnected player - Can't send a message to player ${playerWsId}`);

            return -1;
        }

        return jsonPlayer.ws.send(
            JSON.stringify(message),
            false, true); // not binary, compress
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
