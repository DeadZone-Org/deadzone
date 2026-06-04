import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Wallet, keccak256, parseUnits, toUtf8Bytes } from 'ethers';
import { MockChainView } from './chainView.js';
import { Erc8004 } from './erc8004.js';
import { SettlementAgent } from './settlementAgent.js';
import { signAuthorization } from './sign.js';
import { validateAuth } from './validate.js';
import type { Authorization, Eip712Domain } from './types.js';

const alice = new Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
const CHARLIE = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const NOW = 1_900_000_000;
const domain: Eip712Domain = {
  name: 'Deadzone USD',
  version: '1',
  chainId: 5003,
  verifyingContract: '0x000000000000000000000000000000000000c0DE',
};
const n = (s: string) => keccak256(toUtf8Bytes(s));
const view = () =>
  new MockChainView({
    now: NOW,
    balances: { [alice.address.toLowerCase()]: parseUnits('1000', 18) },
    gasWei: 20_000_000n,
  });
const auth = (amt: string, validBefore: number, label: string) =>
  signAuthorization(alice, domain, {
    from: alice.address,
    to: CHARLIE,
    value: parseUnits(amt, 18),
    validAfter: 0,
    validBefore,
    nonce: n(label),
  });

test('valid authorization passes', async () => {
  const a = await auth('10', NOW + 3600, 'v1');
  assert.deepEqual(await validateAuth(a, view(), domain), { ok: true });
});

test('expired authorization is rejected', async () => {
  const a = await auth('10', NOW - 1, 'v2');
  const r = await validateAuth(a, view(), domain);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'expired');
});

test('tampered signature is rejected', async () => {
  const a = await auth('10', NOW + 3600, 'v3');
  const tampered: Authorization = { ...a, value: a.value + 1n }; // value changed after signing
  const r = await validateAuth(tampered, view(), domain);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'signature mismatch');
});

test('insufficient balance is rejected', async () => {
  const a = await auth('2000', NOW + 3600, 'v4'); // balance is 1000
  const r = await validateAuth(a, view(), domain);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'insufficient balance');
});

test('agent settles valid, rejects expired, batches, pre-commits + attests', async () => {
  const queue = [
    await auth('10', NOW + 3600, 'a1'),
    await auth('20', NOW - 5, 'a2'), // expired
    await auth('30', NOW + 3600, 'a3'),
  ];
  const agent = new SettlementAgent({
    view: view(),
    domain,
    erc8004: new Erc8004(),
    courierAgentId: 8004n,
    forceFallback: true,
    log: () => {},
  });
  const { plan, outcome } = await agent.process(queue, { dryRun: true });
  assert.equal(plan.reject.length, 1);
  assert.equal(plan.reject[0].reason, 'expired');
  assert.equal(outcome.landed.length, 2);
  assert.equal(plan.batched, true);
  assert.match(outcome.planHash, /^0x[0-9a-f]{64}$/);
  assert.match(outcome.preCommitTx, /^0xSIM_precommit/);
  assert.match(outcome.attestTx, /^0xSIM_attest/);
});
