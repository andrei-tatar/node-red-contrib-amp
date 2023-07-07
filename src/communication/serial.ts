import { Observable, Subject } from 'rxjs';

import { SerialPort } from 'serialport';

import { Logger } from '../log';

export class SerialLayer {
    private constructor(
        private serial: SerialPort,
        readonly data$: Observable<Buffer>,
    ) {
    }

    static connect(path: string, baudRate: number = 230400, logger: Logger | null) {
        return new Observable<SerialLayer>(observer => {
            logger?.info(`serial: connecting to ${path}:${baudRate}`);
            const data = new Subject<Buffer>();
            const serial = new SerialPort({
                path: path,
                baudRate: baudRate,
                dataBits: 8,
                stopBits: 1,
                parity: 'none',
                autoOpen: false,
            });
            serial.on('data', b => data.next(b));
            serial.open(err => {
                if (err) {
                    logger?.error(`serial.open: ${err.message}`);
                    observer.error(err);
                } else {
                    logger?.info(`serial: connected to ${path}:${baudRate}`);
                }
            });
            const openHandler = () => {
                serial.set({ dtr: false });
                observer.next(new SerialLayer(serial, data));
            };
            const errorHandler = (err: Error) => {
                logger?.warn(`serial.error: ${err.message}`);
                observer.error(err);
            };
            serial.on('open', openHandler);
            serial.on('error', errorHandler);
            return () => {
                serial.off('open', openHandler);
                serial.off('error', errorHandler);
                serial.close(err => {
                    if (err) {
                        logger?.warn(`serial.close: ${err.message}`);
                    }
                });
            };
        });
    }

    send(data: Buffer) {
        return new Observable<never>(observer => {
            if (!this.serial) { throw new Error('serial: port not connected'); }
            this.serial.write(data, (err) => {
                if (err) {
                    observer.error(err);
                } else {
                    observer.complete();
                }
            });
        });
    }
}
