import ciao, {Responder, ServiceType} from '@homebridge/ciao';
import {getLogger} from "@logtape/logtape";

const logger= getLogger(["infra", "mDNS"]);

export class mDnsService {
    readonly responder: Responder;

    constructor(hostname?: string) {
        if (hostname) {
            logger.warn("You're modifying the multicast DNS hostname, this should be done only for development.");
            logger.warn("If this domain doesn't work, make sure to properly configure Vite.js to supports this domain name too.");
        }

        this.responder = ciao.getResponder();

        const mDnsOptions = {
            // @ts-expect-error
            type: ServiceType.HTTP,
            // Ad-hoc
            name: 'SIMPLE WebPlatform',
            hostname: hostname ? hostname : "simple",
            port: +process.env.WEB_APPLICATION_PORT! // `+` converts the `string` to `number`
        };

        logger.trace(mDnsOptions);

        this.responder.createService(mDnsOptions).advertise().then(() => {
            logger.info(`Application is available on http://${mDnsOptions.hostname}.local:${mDnsOptions.port}`);
        });
    }

    getResponder(): Responder {
        return this.responder;
    }
}