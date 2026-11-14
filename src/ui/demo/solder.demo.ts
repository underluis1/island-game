/**
 * Micro-soldering gallery.
 *   ?screen=solder&variant=charge_ic|connector|long_screw|short
 *   &phase=1..5   jump to a phase      &sample=1  pose a mid-phase snapshot     &freeze=1  stop the clock
 *   &tier=1|2     tool tier             &steady=0..1
 */
import { mountSolderGame, type SolderFault } from '../solder';
import { registerDemo, type DemoCtx } from './registry';

function run(faultKind: SolderFault): (ctx: DemoCtx) => void {
  return (ctx) => {
    const tier = ctx.params.get('tier') === '2' ? 2 : 1;
    const steady = Number(ctx.params.get('steady') ?? '0.6');
    const game = mountSolderGame(
      ctx.root.layers.modal,
      { faultKind, toolTier: tier, steadiness: Number.isFinite(steady) ? steady : 0.6 },
      {
        onDone: (quality) => {
          ctx.log('onDone', Math.round(quality * 100) / 100);
          ctx.root.toast({ kind: 'success', title: 'onDone', text: `quality = ${quality.toFixed(2)}` });
        },
        onSfx: (name) => ctx.log('onSfx', name),
      },
    );
    const phase = Number(ctx.params.get('phase') ?? '0');
    if (phase >= 1) game.skipTo(phase, ctx.params.get('sample') === '1');
    if (ctx.params.get('freeze') === '1') window.setTimeout(() => game.freeze(true), 250);
    ctx.onCleanup(() => game.destroy());
  };
}

registerDemo('solder', {
  title: 'Microsaldatura (minigioco)',
  bg: 'dark',
  variants: {
    charge_ic: run('charge_ic'),
    connector: run('connector'),
    long_screw: run('long_screw'),
    short: run('short'),
  },
});
