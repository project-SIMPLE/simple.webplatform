import { io } from "socket.io-client";

const socket = io("http://10.2.172.36:3001"); //la socket ici c'est le port du serveur socket.js

export default socket;