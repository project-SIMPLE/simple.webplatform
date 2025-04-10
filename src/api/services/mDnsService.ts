import ciao, {Responder, ServiceType} from '@homebridge/ciao';
import {useExtraVerbose} from "../index.ts";

// Override the log function
const log = (...args: any[]) => {
    console.log("\x1b[37m[mDNS]\x1b[0m", ...args);
};
const logWarn = (...args: any[]) => {
    console.warn("\x1b[37m[mDNS]\x1b[0m", "\x1b[43m", ...args, "\x1b[0m");
};
const logError = (...args: any[]) => {
    console.error("\x1b[37m[mDNS]\x1b[0m", "\x1b[41m", ...args, "\x1b[0m");
};

export class mDnsService {
    readonly responder: Responder;

    constructor(hostname?: string) {
        if (hostname) {
            logWarn("You're modifying the multicast DNS hostname, this should be done only for development.");
            logWarn("If this domain doesn't work, make sure to properly configure Vite.js to supports this domain name too.");
        }

        this.responder = ciao.getResponder();

        const mDnsOptions = {
            // @ts-ignore
            type: ServiceType.HTTP,
            // Ad-hoc
            name: 'SIMPLE WebPlatform',
            hostname: hostname ? hostname : "simple",
            port: +process.env.WEB_APPLICATION_PORT! // `+` converts the `string` to `number`
        };

        if (useExtraVerbose) log(mDnsOptions);

        this.responder.createService(mDnsOptions).advertise().then(() => {
            log(`Application is available on http://${mDnsOptions.hostname}.local:${mDnsOptions.port} =================`);
        });
    }

    getResponder(): Responder {
        return this.responder;
    }
}