import { describe, expect, it } from 'vitest';
import { AdaptiveRes } from '../src/render/adaptive';

/** Run a synthetic GPU: frame time = base cost * resolution multiplier^2, floored at vsync. */
function run(a: AdaptiveRes, seconds: number, costMs: number, vsyncHz: number, target = 0): number {
  let t = 0, changes = 0;
  while (t < seconds) {
    const dt = Math.max(1 / vsyncHz, (costMs * a.mul * a.mul) / 1000);
    if (a.update(dt, true, target) !== null) changes++;
    t += dt;
  }
  return changes;
}

describe('dynamic resolution', () => {
  it('stays at native resolution when the machine is fast enough', () => {
    const a = new AdaptiveRes();
    run(a, 20, 5, 60);
    expect(a.mul).toBe(1);
  });

  it('drops resolution to hold the target frame rate on a slow GPU', () => {
    const a = new AdaptiveRes();
    run(a, 20, 30, 144, 144); // 30 ms at full res = 33 fps, wants 144
    expect(a.mul).toBeLessThan(0.8);
    expect(a.mul).toBeGreaterThanOrEqual(0.5);
  });

  it('never goes below the floor', () => {
    const a = new AdaptiveRes();
    run(a, 40, 200, 60, 144);
    expect(a.mul).toBeGreaterThanOrEqual(0.5);
  });

  it('recovers when the load goes away', () => {
    const a = new AdaptiveRes();
    run(a, 15, 30, 144, 144);
    expect(a.mul).toBeLessThan(1);
    run(a, 80, 3, 144, 144);
    expect(a.mul).toBe(1);
  });

  it('does not pump up and down every few seconds', () => {
    const a = new AdaptiveRes();
    // 12 ms at full res: just misses 90 fps, hits it at ~0.9 scale.
    const changes = run(a, 120, 12, 144, 90);
    expect(changes).toBeLessThan(16);
  });

  it('ignores paused or hitching frames', () => {
    const a = new AdaptiveRes();
    for (let i = 0; i < 300; i++) a.update(0.5, true, 0); // tab switch hitches
    for (let i = 0; i < 300; i++) a.update(0.05, false, 0); // paused
    expect(a.mul).toBe(1);
  });
});
