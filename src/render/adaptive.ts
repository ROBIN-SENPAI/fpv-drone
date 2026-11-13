/**
 * Dynamic resolution controller.
 *
 * Keeps the frame rate at a target by trading render resolution for speed. It scales the
 * resolution down quickly when frames are late and creeps back up only after a stable
 * stretch. If raising the resolution made frames late again, that level becomes a ceiling
 * for a while so the picture does not pump up and down (every change reallocates the
 * off-screen buffer, which is itself a small hitch).
 */

const REFRESH_RATES = [60, 72, 75, 90, 100, 120, 144, 165, 240];
const MIN_SCALE = 0.5;
const STEP = 0.05;

export class AdaptiveRes {
  /** Current resolution multiplier, MIN_SCALE..1. */
  mul = 1;
  /** Frame-rate target currently being chased. */
  target = 60;

  private emaMs = 16.7;
  private slow = 0;
  private stable = 0;
  private cooldown = 2; // let shader compilation and warm-up finish first
  private ceiling = 1;
  private ceilingLeft = 0;
  private sinceRaise = 99;
  private winT = 0;
  private winN = 0;
  private peak = 60;

  reset(): void {
    this.mul = 1;
    this.emaMs = 16.7;
    this.slow = this.stable = 0;
    this.cooldown = 2;
    this.ceiling = 1;
    this.ceilingLeft = 0;
  }

  /**
   * Feed one frame. `targetFps` 0 means "auto": the highest common refresh rate the machine
   * has actually reached (never below 60). Returns the new multiplier if it changed.
   */
  update(dt: number, active: boolean, targetFps: number): number | null {
    if (!active || dt > 0.25 || dt <= 0) {
      this.slow = this.stable = 0;
      return null;
    }
    this.emaMs += (dt * 1000 - this.emaMs) * 0.08;
    this.sinceRaise += dt;

    this.winT += dt;
    this.winN++;
    if (this.winT >= 1) {
      const f = this.winN / this.winT;
      this.peak = f > this.peak ? f : this.peak * 0.98;
      this.winT = this.winN = 0;
    }
    if (targetFps > 0) {
      this.target = targetFps;
    } else {
      let t = 60;
      for (const r of REFRESH_RATES) if (r <= this.peak * 1.04) t = r;
      this.target = t;
    }

    if (this.ceilingLeft > 0) {
      this.ceilingLeft -= dt;
      if (this.ceilingLeft <= 0) this.ceiling = 1;
    }
    this.cooldown -= dt;

    const ratio = this.emaMs / (1000 / this.target);
    this.slow = ratio > 1.12 ? this.slow + dt : 0;
    this.stable = ratio < 1.04 ? this.stable + dt : 0;

    if (this.slow > 0.5 && this.cooldown <= 0 && this.mul > MIN_SCALE) {
      const k = Math.max(0.8, Math.min(0.95, 1 / Math.sqrt(ratio)));
      const next = Math.max(MIN_SCALE, Math.round((this.mul * k) / STEP) * STEP);
      if (next < this.mul) {
        if (this.sinceRaise < 6) {
          this.ceiling = next;
          this.ceilingLeft = 30;
        }
        this.mul = next;
        this.cooldown = 1;
        this.slow = this.stable = 0;
        return next;
      }
    }
    if (this.stable > 4 && this.cooldown <= 0 && this.mul < Math.min(1, this.ceiling)) {
      this.mul = Math.min(1, this.ceiling, this.mul + STEP);
      this.sinceRaise = 0;
      this.cooldown = 1;
      this.stable = 0;
      return this.mul;
    }
    return null;
  }
}
