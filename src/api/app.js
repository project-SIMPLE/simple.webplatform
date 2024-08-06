// Imports
import express from 'express';
import fs from 'fs';
import Controller from './controller.js';

/**
 * Creates the server application to get all the html pages required
 */
class App {
    /**
     * Creates an Express server
     * @param {Controller} controller - The model of the server project
     */
    constructor(controller) {
        this.controller = controller;
        this.app_port = process.env.HTTP_PORT;
        var app_port = this.app_port;
        this.app = express();
        this.app.set('view engine', 'ejs');
        this.app.use(express.static('views'));
        this.app.use(express.json()); // Middleware to parse JSON bodies

        this.app.get('/', (req, res) => {
            res.redirect('/monitor');
        });

        this.app.get('/monitor', (req, res) => {
            res.sendFile('monitor.html', { root: 'views/monitor' });
        });

        this.app.get('/monitorV2', (req, res) => {
            res.sendFile('monitorV2.html', { root: 'views/monitorV2' });
        });

        this.app.get('/settings', (req, res) => {
            res.sendFile('settings.html', { root: 'views/settings' });
        });

        this.app.get('/player', (req, res) => {
            if (this.controller.modelManager.getModelList()[0].getJsonSettings().player_web_interface){
                res.sendFile(this.controller.modelManager.getModelList()[0].getJsonSettings().player_html_file, { root: 'views/player' });
            } else {
                res.status(404).sendFile('404_player.html', { root: 'views/public' });
            }
        });

        this.app.get('/getWsMonitorPort', (req, res) => {
            res.json({ "monitor_ws_port": process.env.MONITOR_WS_PORT });
        });

        this.app.get('/getWsGamePort', (req, res) => {
            res.json({ "player_ws_port": process.env.HEADSET_WS_PORT });
        });

        this.app.get('/favicon.ico', (req, res) => {
            res.sendFile('favicon.ico', { root: 'views/public' });
        });

        this.app.get('/help', (req, res) => {
            res.redirect('https://github.com/project-SIMPLE/GamaServerMiddleware/wiki');
        });

        // Route to launch the experiment
        this.app.post('/launch-experiment', (req, res) => {
            this.controller.launchExperiment();
            res.send({ message: 'Experiment launched' });
        });

        this.app.use((req, res) => {
            res.status(404).sendFile('404_common.html', { root: 'views/public' });
        });

        this.server = this.app.listen(this.app_port, () => {
            console.log(`-> Listening on port ${this.app_port}`);
        });

        this.server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`\x1b[31m-> The port ${this.app_port} is already in use. Choose a different port in settings.json.\x1b[0m`);
            } else {
                console.log(`\x1b[31m-> An error occurred for the app server, code: ${err.code}\x1b[0m`);
            }
        });
    }
}

export default App;
