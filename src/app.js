//Imports
const express = require('express');
const fs = require('fs');

// Default values
const DEFAULT_APP_PORT = 80;

class App {
    constructor(server_model) {
        this.server_model = server_model;
        this.app_port = server_model.json_settings.app_port != undefined ? server_model.json_settings.app_port : DEFAULT_APP_PORT;
        
        const app = express();
        app.use(express.static('views/monitor'));
        app.use(express.static('views/public'));
        app.use(express.static('views/game'));

        // Configurez le type MIME pour les fichiers CSS
        app.get('/monitor/monitor.css', (req, res) => {
          res.type('text/css');
          res.sendFile('monitor.css', { root: 'views/monitor' });
        });

        // Configurez le type MIME pour les fichiers JavaScript
        app.get('/monitor/monitor.js', (req, res) => {
          res.type('text/javascript');
          res.sendFile('monitor.js', { root: 'views/monitor' });
        });
        
        app.get('/monitor', (req, res) => {
          res.sendFile('monitor.html', { root: 'views/monitor' });
        });

        // Configurez le type MIME pour les fichiers CSS
        app.get('/monitor/settings.css', (req, res) => {
          res.type('text/css');
          res.sendFile('settings.css', { root: 'views/monitor' });
        });

        // Configurez le type MIME pour les fichiers JavaScript
        app.get('/monitor/settings.js', (req, res) => {
          res.type('text/javascript');
          res.sendFile('settings.js', { root: 'views/monitor' });
        });
        
        app.get('/settings', (req, res) => {
          res.sendFile('settings.html', { root: 'views/monitor' });
        });
        
        app.get('/game', (req, res) => {
          res.sendFile('game.html', { root: 'views/game' });
        });

        app.get('/home', (req, res) => {
          res.sendFile('home.html', { root: 'views/public' });
        });
        
        app.get('/favicon.ico', (req, res) => {
          res.sendFile('favicon.ico', { root: 'views/public' });
        });

        app.get('/', (req, res) => {
          res.redirect('/home');
        });

        app.listen(this.app_port, () => {
            console.log(`Listening on port ${this.app_port}`)
        });

        
    }
}

module.exports = App;