//Imports
const express = require('express');
const fs = require('fs');
const Controller = require('./controller');

// Default values
const DEFAULT_APP_PORT = 80;

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
        this.app_port = this.controller.model.getJsonSettings().app_port != undefined ? controller.model.getJsonSettings().app_port : DEFAULT_APP_PORT;
        var app_port = this.app_port
        this.app = express();
        this.app.set('view engine', 'ejs');
        this.app.use(express.static('views'));

        this.app.get('/', (req, res) => {
          res.redirect('/monitor');
        });

        this.app.get('/monitor', (req, res) => {
          res.sendFile('monitor.html', { root: 'views/monitor' });
        });
        
        this.app.get('/settings', (req, res) => {
          res.sendFile('settings.html', { root: 'views/settings' });
        });
        
        this.app.get('/player', (req, res) => {
          if (this.controller.model.getJsonSettings().player_web_interface){
            res.sendFile(this.controller.model.getJsonSettings().player_html_file, { root: 'views/player' });
          }
          else {
            res.status(404).sendFile('404_player.html', { root: 'views/public' });
          }
        });
      
        this.app.get('/getWsMonitorPort', (req, res) => {
          res.json({ "monitor_ws_port" : controller.model.getJsonSettings().monitor_ws_port });
        });

        this.app.get('/getWsGamePort', (req, res) => {
          res.json({ "player_ws_port" : controller.model.getJsonSettings().player_ws_port });
        });
        
        this.app.get('/favicon.ico', (req, res) => {
          res.sendFile('favicon.ico', { root: 'views/public' });
        });

        this.app.get('/help', (req, res) => {
          res.redirect('https://github.com/project-SIMPLE/GamaServerMiddleware/wiki');
        });

        this.app.use((req, res) => {
          res.status(404).sendFile('404_common.html', { root: 'views/public' });
        });

        this.server = this.app.listen(this.app_port, () => {
            console.log(`-> Listening on port ${this.app_port}`)
        });

        this.server.on('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            console.error(`\x1b[31m-> The port ${this.app_port} is already in use. Choose a different port in settings.json.\x1b[0m`);
          } 
          else {
            console.log(`\x1b[31m-> An error occured for the app server, code: ${err.code}\x1b[0m`)
          }
        });
    }
}

module.exports = App;