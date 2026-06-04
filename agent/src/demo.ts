/**
 * DEADZONE Settlement Agent — runnable reasoning demo.
 *
 *   cd agent && npm run demo
 *
 * Simulates a gateway node that just regained connectivity and received 3 offline-signed
 * payments over the mesh (one deliberately expired). Runs the full agent loop in dry-run
 * with no keys/network and prints the agent's live reasoning. Doubles as a smoke test.
 *
 * Set ZAI_API_KEY to route planning through the real Z.ai GLM agent instead of the fallback.
 */
import { Wallet, keccak256, parseUnits, toUtf8Bytes } from 'ethers';
import { MockChainView } from './chainView.js';
import { Erc8004 } from './erc8004.js';
import { SettlementAgent } from './settlementAgent.js';
import { signAuthorization } from './sign.js';
import type { Authorization, Eip712Domain } from './types.js';

const ALICE_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // test-only
const CHARLIE = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const NOW = 1_900_000_000;

async function main(): Promise<void> {
  const alice = new Wallet(ALICE_PK);
  const domain: Eip712Domain = {
    name: 'Deadzone USD',
    version: '1',
    chainId: 5003,
    verifyingContract: '0x000000000000000000000000000000000000c0DE',
  };
  const nonce = (s: string) => keccak256(toUtf8Bytes(s));
  const auth = (to: string, amt: string, validBefore: number, n: string) =>
    signAuthorization(alice, domain, {
      from: alice.address,
      to,
      value: parseUnits(amt, 18),
      validAfter: 0,
      validBefore,
      nonce: nonce(n),
    });

  const queue: Authorization[] = [
    await auth(CHARLIE, '10', NOW + 3600, 'n1'), // valid
    await auth(CHARLIE, '20', NOW - 10, 'n2'), // EXPIRED -> agent must reject
    await auth(CHARLIE, '30', NOW + 3600, 'n3'), // valid
  ];

  const view = new MockChainView({
    now: NOW,
    balances: { [alice.address.toLowerCase()]: parseUnits('1000', 18) },
    gasWei: 20_000_000n,
  });
  const agent = new SettlementAgent({
    view,
    domain,
    erc8004: new Erc8004(),
    courierAgentId: 8004n,
    forceFallback: !process.env.ZAI_API_KEY,
  });

  console.log('\n=== DEADZONE · gateway regained connectivity, draining the mesh queue ===\n');
  const { plan, outcome } = await agent.process(queue, { dryRun: true });

  console.log('\n--- result ---');
  console.log('settled :', outcome.landed.map((n) => n.slice(0, 10)));
  console.log('rejected:', plan.reject.map((r) => `${r.auth.nonce.slice(0, 10)} (${r.reason})`));
  console.log('source  :', plan.source, '| planHash:', outcome.planHash.slice(0, 14) + '…');

  const ok =
    plan.reject.length === 1 &&
    plan.reject[0].reason === 'expired' &&
    outcome.landed.length === 2 &&
    plan.batched === true;
  console.log(`\nsmoke: ${ok ? 'PASS ✅' : 'FAIL ❌'}`);
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
