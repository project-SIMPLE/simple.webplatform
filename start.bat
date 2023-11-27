@echo off

REM Exécute npm install
npm install

REM Ouvre la page web dans Firefox
start "" "http://localhost:8000"

REM Exécute npm start en premier plan
node index.js

REM Attend que l'utilisateur appuie sur "Entrée" pour quitter
set /p input="Press enter to quit..."
