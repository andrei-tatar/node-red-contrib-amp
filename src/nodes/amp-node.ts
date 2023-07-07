import { combineLatest, concat, defer, EMPTY, interval, merge, ReplaySubject } from 'rxjs';
import { catchError, concatMap, finalize, first, map, retry, share, switchMap, tap, timeout } from 'rxjs/operators';

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
        const amp$ = SerialLayer.connect(url.pathname, baudRate, logger)
            .pipe(
                tap(() => {
                    this.status({ fill: 'green', shape: 'ring', text: 'connected' });
                }),
                map(s => new PackageLayer(s)),
                map(p => new Amplifier(p)),
                share({ connector: () => new ReplaySubject(1) }),
            );

        const state$ = amp$.pipe(
            switchMap(p => p.state$),
            tap(s => this.send({ payload: s })),
        );

        this.on('input', msg => {
            if (typeof msg !== 'object' || typeof msg.payload !== 'object') {
                return;
            }

            amp$.pipe(
                first(),
                switchMap(p => p.updateState(msg.payload)),
                catchError(err => {
                    this.error(`while sending to amp: ${err.message}`);
                    return EMPTY;
                }),
            ).subscribe();
        });

        const periodicPoll$ = combineLatest([
            amp$,
            interval(timeSpan(1, 'min')),
        ]).pipe(
            concatMap(([a]) => {
                const rx = state$.pipe(first());
                const tx = a.requestState();

                return merge(rx, tx).pipe(
                    timeout(timeSpan(5, 'sec')),
                );
            })
        );

        const status$ = concat(
            defer(() => {
                this.status({ fill: 'yellow', shape: 'ring', text: 'connecting' });
                return EMPTY;
            }),
            state$.pipe(
                tap((s) => {
                    this.status({ fill: 'blue', shape: 'ring', text: `${s.on ? 'on' : 'off'} - ${s.volume}%` });
                }),
                finalize(() => {
                    this.status({ fill: 'red', shape: 'ring', text: 'not connected' });
                }),
            ));

        const subscription = combineLatest([
            state$,
            periodicPoll$,
            status$,
        ]).pipe(
            retry({ delay: 20000 }),
        ).subscribe();

        this.on('close', () => subscription.unsubscribe());
    }

    RED.nodes.registerType('amp-node', AmpNode);
};
