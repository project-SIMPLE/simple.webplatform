# Gama Server Middleware

**The full documentation is available in the [wiki page](https://github.com/project-SIMPLE/GamaServerMiddleware/wiki)**

## Introduction

**Gama Server Middleware is a tool made for creating multiplayer games using Gama.** It requires the parallel use of Gama Server in order to function. **Gama Server Middleware** server that can **connect to Gama Server** and allows **players to play** to a **Gama modelized game**. This server can **monitor** every **connections**. Thanks to the latter, **Gama model doesn't need to manage connections** with the players, it simply needs to **implement** in the simulation the commands of **what a player can do** and indicate which **outputs need to be retrieved** at each simulation cycle.

## Documentation

**The full documentation is available in the [wiki page](https://github.com/project-SIMPLE/GamaServerMiddleware/wiki)**

![Gama Server Middleware](https://github.com/project-SIMPLE/GamaServerMiddleware/assets/104212258/0537f360-0c30-41b4-9b96-74e85d6ae5c2)

## Launching

**For more information, please see the [wiki page](https://github.com/project-SIMPLE/GamaServerMiddleware/wiki)**

- **Install node.js**
- **To start the middleware:**
   - If you're using **Windows**: run ``start.bat``, located in the project root directory.
   - If you're using **MacOS**: run ``start.sh``, located in the project root directory.

This execution also open a webpage [localhost:app_port/monitor](http:localhost:8000/monitor). If there is no display, please refresh this page. ```app_port``` is by default **8000**.

