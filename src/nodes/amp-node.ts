import { combineLatest, concat, defer, EMPTY, interval, merge, ReplaySubject } from 'rxjs';
import { catchError, concatMap, distinctUntilChanged, finalize, first, ignoreElements, map, retry, share, startWith, switchMap, tap, timeout } from 'rxjs/operators';

import { NodeInterface } from '..';
import { logger } from '../log';
import { SerialLayer } from '../communication/serial';
import { PackageLayer } from '../communication/package';
import { timeSpan } from '../util';
import { Amplifier } from '../communication/amp';

module.exports = function (RED: any) {

    function AmpNode(this: NodeInterface, config: any) {
        RED.nodes.createNode(this, config);

        const url = new URL(config.port);
        if (url.protocol !== 'serial:') {
            throw new Error(`protocol not supported: ${config.port}`);
        }

        const baudRate = parseInt(url.searchParams.get('baudRate') ?? '115200');
        const amp$ = concat(
            defer(() => {
                this.status({ fill: 'yellow', shape: 'ring', text: 'connecting' });
                return EMPTY;
            }),
            SerialLayer.connect(url.pathname, baudRate, logger)
                .pipe(
                    tap(() => {
                        this.status({ fill: 'green', shape: 'ring', text: 'connected' });
                    }),
                    map(serial => new PackageLayer(serial)),
                    map(pckg => new Amplifier(pckg)),
                    share({ connector: () => new ReplaySubject(1) }),
                )
        ).pipe(
            finalize(() => {
                this.status({ fill: 'red', shape: 'ring', text: 'not connected' });
            }),
        );

        const outputState$ = amp$.pipe(
            switchMap(amp => amp.state$),
            tap(state => this.send({ payload: state })),
            ignoreElements(),
        );

        this.on('input', msg => {
            if (typeof msg !== 'object' || typeof msg.payload !== 'object') {
                return;
            }

            amp$.pipe(
                first(),
                switchMap(p => p.updateState(msg.payload)),
                catchError(err => {
                    this.error(`while sending ${JSON.stringify(msg.payload)} to amp: ${err.message}`);
                    return EMPTY;
                }),
            ).subscribe();
        });

        const periodicPoll$ = combineLatest([
            amp$,
            interval(timeSpan(1, 'min')).pipe(startWith(0)),
        ]).pipe(
            concatMap(([a]) => {
                const rx = a.state$.pipe(first());
                const tx = a.requestState();

                return merge(rx, tx).pipe(
                    timeout(timeSpan(5, 'sec')),
                );
            }),
            ignoreElements(),
        );

        const status$ = amp$.pipe(
            switchMap(amp => amp.state$),
            map(state => `${state.on ? 'on' : 'off'} - ${state.volume}%`),
            distinctUntilChanged(),
            tap(status => this.status({ fill: 'blue', shape: 'ring', text: status })),
            ignoreElements(),
        );

        const subscription = combineLatest([
            outputState$,
            periodicPoll$,
            status$,
        ]).pipe(
            retry({ delay: 20000 }),
        ).subscribe();

        this.on('close', () => subscription.unsubscribe());
    }

    RED.nodes.registerType('amp-node', AmpNode);
};
