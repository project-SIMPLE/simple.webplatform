console.log('\n\x1b[95mWelcome to Gama Server Middleware !\x1b[0m\n');

console.log("Starting application with system settings:", require('dotenv').config(),"\n")

// Set default values
process.env.GAMA_WS_PORT = process.env.GAMA_WS_PORT !== undefined ? process.env.GAMA_WS_PORT : 1000;
process.env.GAMA_IP_ADDRESS = process.env.GAMA_IP_ADDRESS !== undefined ? process.env.GAMA_IP_ADDRESS : localhost;

process.env.HEADSET_WS_PORT = process.env.HEADSET_WS_PORT !== undefined ? process.env.HEADSET_WS_PORT : 8080;

process.env.MONITOR_WS_PORT = process.env.MONITOR_WS_PORT !== undefined ? process.env.MONITOR_WS_PORT : 8001;

process.env.HTTP_PORT = process.env.HTTP_PORT !== undefined ? process.env.HTTP_PORT : 8000;
process.env.APP_IP_ADDRESS = process.env.APP_IP_ADDRESS !== undefined ? process.env.APP_IP_ADDRESS : localhost;
process.env.VERBOSE = process.env.VERBOSE !== undefined ? process.env.VERBOSE : false;

console.log(process.env);

const Controller = require('./src/controller.js');

new Controller();