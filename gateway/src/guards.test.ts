import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Cooldown, RateLimiter, checkAddress, checkAmount } from './guards.js';

test('checkAmount accepts valid, rejects junk + over-cap', () => {
  const ok = checkAmount('100', 1000);
  assert.equal(ok.ok, true);
  assert.equal((ok as { value: bigint }).value, 100n * 10n ** 18n);

  assert.equal(checkAmount('0', 1000).ok, false);
  assert.equal(checkAmount('-5', 1000).ok, false);
  assert.equal(checkAmount('abc', 1000).ok, false);
  assert.equal(checkAmount('5000', 1000).ok, false); // over cap
  assert.equal(checkAmount('1.5', 1000).ok, true);
});

test('checkAddress validates 0x addresses', () => {
  assert.equal(checkAddress('0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC').ok, true);
  assert.equal(checkAddress('0xnope').ok, false);
  assert.equal(checkAddress('').ok, false);
  assert.equal(checkAddress(undefined).ok, false);
});

test('RateLimiter blocks past the window max', () => {
  const rl = new RateLimiter(1000, 3);
  const now = 10_000;
  assert.equal(rl.allow('ip', now), true);
  assert.equal(rl.allow('ip', now), true);
  assert.equal(rl.allow('ip', now), true);
  assert.equal(rl.allow('ip', now), false); // 4th in window → blocked
  assert.equal(rl.allow('ip', now + 1001), true); // window passed → allowed
  assert.equal(rl.allow('other', now), true); // separate key unaffected
});

test('Cooldown enforces per-key wait', () => {
  const cd = new Cooldown(5000);
  const now = 1_000_000;
  assert.equal(cd.check('0xabc', now).ok, true);
  cd.mark('0xabc', now);
  const blocked = cd.check('0xABC', now + 1000); // case-insensitive
  assert.equal(blocked.ok, false);
  assert.equal((blocked as { retryInMs: number }).retryInMs, 4000);
  assert.equal(cd.check('0xabc', now + 5001).ok, true); // cooldown elapsed
});
