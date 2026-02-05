import express from 'express';
import path from 'path';
import fs from 'fs';
import { getLogger } from "@logtape/logtape";
import { fileURLToPath } from 'url';

const logger = getLogger(["infra", "StaticServer"]);

export class StaticServer {
    constructor() {
        logger.debug(`Starting express server for static files...`);
        const app = express();
        const port = process.env.WEB_APPLICATION_PORT || '5173';
        
        // In bundled environment, dist might be relative to the executable or the script
        // When using pkg, assets are often at /snapshot/project/dist
        // We will try to find the dist folder
        
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        
        // Try multiple possible paths for 'dist'
        const possiblePaths = [
            path.resolve(__dirname, 'dist'),           // If index.cjs is next to dist
            path.resolve(__dirname, '../dist'),        // If index.cjs is in a subfolder (like dist-api)
            path.resolve(__dirname, '../../../dist'),  // If running from src/api/infra
        ];
        
        let distPath = '';
        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                distPath = p;
                break;
            }
        }

        if (!distPath) {
            logger.error("Could not find 'dist' directory for static files");
            return;
        }

        logger.debug(`Serving static files from: ${distPath}`);
        app.use(express.static(distPath));
        
        // Handle SPA routing
        app.get('*', (req, res) => {
            res.sendFile(path.join(distPath, 'index.html'));
        });

        app.listen(port, () => {
            logger.info(`=========================================\n\n\tWebplatform started and is accessible\n\t\t     http://localhost:${port}\n\n=========================================`);
        });
    }
}
