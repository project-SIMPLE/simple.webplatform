### Building the Executable

To package this application into a single Linux executable, follow these steps:

1.  **Install dependencies**:
    ```bash
    npm install
    ```

2.  **Build the executable**:
    ```bash
    npm run build:executable
    ```
    This command will:
    - Build the Vite frontend into the `dist` folder.
    - Bundle the Node.js backend into `dist-api/index.cjs` using Vite (handling TypeScript and ESM conversion).
    - Package everything into a single binary located in the `bin` directory using `@yao-pkg/pkg`.

### Distribution

The generated executables are located in the `bin/` directory.

**Requirements for running**:
- **Operating System**: Linux (x64) or Windows (x64).
- **External Configuration**: The application expects a `.env` file to be present in the **same directory** as the executable.
- **Dependencies**: No Node.js installation is required. However, the application still relies on `adb` being installed on the host system if Android device management is needed.

### Technical Details

- **Packaging Tool**: `@yao-pkg/pkg` (a maintained fork of `pkg` that supports Node >=20).
- **Backend Bundling**: Vite is used to bundle the backend. This ensures that:
    - All TypeScript files and ESM imports are resolved.
    - Dependencies are bundled into a single file to avoid issues with subpath imports or complex `node_modules` structures in the packaged environment.
    - Native modules (like `uWebSockets.js`) are kept external and included as assets.
- **Static Files**: The Vite-built frontend is bundled into the executable and served via an Express server integrated into the backend when running in packaged mode.
- **Environment Variables**: `dotenv` is configured to look for the `.env` file in the directory of the executable (`process.execPath`).
