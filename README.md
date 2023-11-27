# Gama Server Linker

## Introduction

This code creates a server that can connect to Gama Server and allows players to play to a Gama modelized game.
This server can monitor every connection. Thanks to the latter, Gama model doesn't need to manage connections with the players, it simply needs to implement in the simulation the commands of what a player can do and indicate which outputs need to be retrieved at each simulation cycle.
An example is already implemented in the code. In this one, players are represented by dots that can move within a zone. The player interface can visualize this moving point.

## Installation and launching

The server requires NodeJs. If you don't have, please install it [here](https://nodejs.org/) before running.
To run the server:
- Download the code,
- In the directory of the project:
  - If you use MacOs: execute ```start.sh```
  - If you use Windows: execute ```start.bat```
    
- The server is now launched.

This execution also open a webpage [localhost:8000/monitor](http:localhost:8000/monitor). If there is no display, please refresh this page.

You will also need to load Gama Server:
- If you have a recent version of Gama wich includes Gama Server GUI (GAMA 1.9.4+), you only need to launch GAMA
- If you have an older version of GAMA, you will need to launch Gama Server. For more information see this [documentation](https://gama-platform.org/wiki/HeadlessServer).
**You can start Gama before or after the middleware**

### Monitor page

Go to [localhost:8000/](http:localhost:8000/) or [localhost:8000/monitor](http:localhost:8000/monitor)
There is also the page settings which allows you to change the ports and the model file loaded by Gama Server. You can also change these settings before launching the middleware server by going to settings.json

### Player page (Optionnal)

Go to [localhost:8000/player](http:localhost:8000/player)
This feature can be activated in the setting page in 'About player' by clicking on 'Player web interface'.
When a player connects, you will see it on the monitor page and you can add it on the gama simulation when it is launched.

## Operating details

You can see below the schema of the operation of the server. The server magages the several connections and authenticate the players to Gama.

![Operating details](https://github.com/project-SIMPLE/GamaServerMiddleware/assets/104212258/11a17b79-2ec2-4fa1-ad95-a174807a8437)

**About internet ports:**
- *Application port* is the HTTP web interface of the server. If you change this port, you have to go the the webpage [localhost:your_new_port/](http:localhost:your_new_port/).
- *Monitor websocket port* can be changed freely without any consequences for the use. I gave the possibility to change it if there is a concurrency.
- *GAMA Server websocket port* must be the same as the port used by Gama Server. You will be able to see which one in used in the setting page of GAMA.
- *Player websocket port* is the port where player will connect.

## Create your own game
First, you will have to create a new model based on the example model1.gaml
You will need to create a webpage based on player.html.
If you want to add player's instructions, you will also need to add code in player_server.js, server_model.js and gama_server.js. To understand how this code works, I created an UML diagram to show you the structure of the code.

![Pseudo UML Diagram](https://github.com/leonsi7/gama-server-middleware/assets/104212258/ae3ac0c4-1663-47b0-b916-dbad47586010)

