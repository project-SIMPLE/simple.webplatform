# ![SIMPLE Logo](https://avatars.githubusercontent.com/u/137744200?s=100&v=4) Simple WebPlatform 

Web Application for monitoring and managing multiplayer connections to Gama Server simulation.

## Overview 🚀  
The Simple WebPlatform is a versatile server designed to:  
- **Manage multiplayer connections** 🥽 for seamless user experiences in collaborative environments.
- **Monitor Gama Server simulations** 🖥️ for data-driven insights.  

Built with **React**, **TypeScript**, and **Vite**, this project leverages modern technologies for robust real-time communication.

---

## Features ✨  
- **WebSocket Integration**: Efficient real-time data streaming.  
- **Gama Server Monitoring**: Track, communicate and pilot GAMA simulation.  
- **Multiplayer Management**: Simplify connection handling in multiplayer games.  
- **Extensible Architecture**: Built for scalability and custom workflows.

---

## Tech Stack 🛠️  
- **Languages**: TypeScript, JavaScript  
- **Frameworks**: React, Node.js  
- **Build Tool**: Vite  
- **Other Tools**: ESLint, TailwindCSS, PostCSS

---

## Getting Started 🏗️  

### Prerequisites  
- Node.js >= v22
- npm or yarn  
### Installing Node and npm
- To install Node.js, go to [https://nodejs.org/en/download](https://nodejs.org/en/download)
- From here, select the operating system of your machine, and use either the command or the installer.
- if you selected the installer option, you can check Node and npm were installed correctly using the command:
  ```bash
   node -v npm -v
  ```
this command should return the version of both tools.
### Installation  

1. Clone the repository:  
   ```bash
   git clone https://github.com/project-SIMPLE/simple.webplatform.git
   cd simple.webplatform
   ```
2. Install dependencies:  
   ```bash
   npm install
   ```
   
3. Configure environment variables:
   -If you have a GAMA simulation VR game with its own generated .env:
   copy this `.env` to the location `simple.webplatform/.env` in the web platform. 
   
   **OR**

   -If you do not have a generated .env, use the example one provided in the application:
   
   - Copy `.env.example` to `.env`:  
     ```bash
     cp .env.example .env
     ```
     
   - Update the values based on your setup, most notably the `EXTRA_LEARNING_PACKAGE_PATH` to add an extra folder to scan for GAMA experiments, and the values `GAMA_WS_PORT` and `GAMA_IP_ADRESS` if you have a custom setup different from the default one.
   - For more informations about the .env file, refer to the Documentation reference, that can be found (here)[https://doc.project-simple.eu/Technical/env_reference].

5. Start the development server:  
   ```bash
   npm start
   ```
   
> Mind that while the GAMA Platform have to be running and accessible by the web platform, it can be started at any time, and will automatically connect if started after the webplatform.

---

## Usage 🕹️  
Once the server is running:  
1. Access the interface at [http://localhost:8000](http://localhost:8000) 
2. Connect it to your Gama simulations and observe real-time updates.  
3. Test multiplayer functionality with sample clients or your own game server.

---

## Contributing 🤝  
Contributions are welcome! Follow these steps:  
1. Fork the repository.  
2. Create a new branch (`git checkout -b feature-branch`).  
3. Commit your changes (`git commit -m "Add feature"`).  
4. Push to your branch (`git push origin feature-branch`).  
5. Open a Pull Request.

---

## License 📄  
This project is licensed under the AGPL-3.0 License. See the [LICENSE](LICENSE) file for details.

---

## Acknowledgments 🙌
- Built with ❤️ by the [Project SIMPLE](https://github.com/project-SIMPLE) team.  
- Thanks to [yume-chan](https://github.com/yume-chan/) for his awesome [ya-webadb](https://github.com/yume-chan/ya-webadb) library

--- 

Feel free to open issues or discussions for questions and ideas! 😊  
