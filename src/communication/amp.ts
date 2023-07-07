import { concat, defer, filter, map } from "rxjs";
import { PackageLayer } from "./package";

export class Amplifier {
    constructor(private pckg: PackageLayer) {
    }

    state$ = this.pckg.data$.pipe(
        map(msg => {
            if (msg[0] === 1 && msg.length === 4) {
                return {
                    on: msg[1] !== 0,
                    channel: msg[2],
                    volume: msg[3],
                } as AmpState;
            }
            return null;
        }),
        filter(isDefined),
    );

    requestState() {
        return this.pckg.send(Buffer.from([0x01]));
    }

    updateState(state: Partial<AmpState>) {
        return defer(() => {
            const todo: Buffer[] = [];

            if ('on' in state) {
                todo.push(Buffer.from([0xE0, state.on ? 1 : 0]));
            }

            if ('channel' in state && typeof state.channel === 'number' &&
                state.channel >= 1 && state.channel <= 8) {
                todo.push(Buffer.from([0xCA, state.channel]));
            }

            if ('volume' in state && typeof state.volume === 'number' &&
                state.volume > 0 && state.volume <= 255) {
                todo.push(Buffer.from([0x10, state.volume]));
            }

            const send = todo.map(msg => this.pckg.send(msg));
            return concat(...send);
        });
    }
}

interface AmpState {
    volume: number;
    on: boolean;
    channel: number;
}

function isDefined<T>(value: T | null | undefined): value is T {
    return !!value;
}