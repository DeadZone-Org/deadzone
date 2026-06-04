import { isAddress, parseUnits } from 'ethers';

/**
 * Safety guards for the public gateway. The gateway holds the courier key and pays gas,
 * so every endpoint must be bounded: valid inputs, capped amounts, rate limits, faucet
 * cooldowns. All pure/in-memory so they're unit-testable without a chain.
 */

export const LIMITS = {
  maxPayAmount: Number(process.env.MAX_PAY_AMOUNT ?? 1000), // dUSD per settlement
  faucetAmount: Number(process.env.FAUCET_AMOUNT ?? 1000), // dUSD per faucet grant
  faucetCooldownMs: Number(process.env.FAUCET_COOLDOWN_MS ?? 5 * 60_000), // per address
  rateWindowMs: Number(process.env.RATE_WINDOW_MS ?? 60_000),
  rateMax: Number(process.env.RATE_MAX ?? 20), // requests per window per IP
};

export type GuardResult = { ok: true; value: bigint } | { ok: false; error: string };

/** Validate + cap an amount string; returns wei. */
export function checkAmount(amount: unknown, maxUnits = LIMITS.maxPayAmount): GuardResult {
  const s = String(amount ?? '').trim();
  if (!/^\d+(\.\d{1,18})?$/.test(s)) return { ok: false, error: 'invalid amount' };
  const n = Number(s);
  if (!(n > 0)) return { ok: false, error: 'amount must be > 0' };
  if (n > maxUnits) return { ok: false, error: `amount exceeds cap of ${maxUnits}` };
  return { ok: true, value: parseUnits(s, 18) };
}

/** Validate a 0x address. */
export function checkAddress(addr: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const s = String(addr ?? '').trim();
  if (!isAddress(s)) return { ok: false, error: 'invalid address' };
  return { ok: true, value: s };
}

/** Sliding-window rate limiter keyed by client id (IP). */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private windowMs = LIMITS.rateWindowMs,
    private max = LIMITS.rateMax,
  ) {}
  allow(key: string, now = Date.now()): boolean {
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (arr.length >= this.max) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(key, arr);
    return true;
  }
}

/** Per-address cooldown (e.g. faucet). */
export class Cooldown {
  private last = new Map<string, number>();
  constructor(private cooldownMs = LIMITS.faucetCooldownMs) {}
  check(key: string, now = Date.now()): { ok: true } | { ok: false; retryInMs: number } {
    const prev = this.last.get(key.toLowerCase());
    if (prev !== undefined && now - prev < this.cooldownMs) {
      return { ok: false, retryInMs: this.cooldownMs - (now - prev) };
    }
    return { ok: true };
  }
  mark(key: string, now = Date.now()): void {
    this.last.set(key.toLowerCase(), now);
  }
}
