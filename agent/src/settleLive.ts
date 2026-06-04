/**
 * DEADZONE — real end-to-end settlement on Mantle Sepolia.
 *
 *   cd agent && npm run settle:live
 *
 * Offline-signs an EIP-3009 payment, then runs the agent against the LIVE deployed
 * contracts: validate -> plan (GLM/fallback) -> settle on Mantle -> read attribution.
 * Proves the whole loop works on real chain. Needs PRIVATE_KEY (contracts/.env).
 */
import { Contract, JsonRpcProvider, Wallet, keccak256, parseUnits, toUtf8Bytes } from 'ethers';
import { RpcChainView } from './chainView.js';
import { Erc8004 } from './erc8004.js';
import { makeOnchainSettle } from './gateway.js';
import { SettlementAgent } from './settlementAgent.js';
import { signAuthorization } from './sign.js';
import type { Eip712Domain } from './types.js';

const RPC = process.env.MANTLE_SEPOLIA_RPC ?? 'https://rpc.sepolia.mantle.xyz';
const TOKEN = '0x3887c55b01d5664d8ABa7dB526C9bf24BfAe4272';
const SETTLEMENT = '0xBC133614d147216beA6219189f3F5c4358fcf870';
const RECIPIENT = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const DEADZONE_AGENT_ID = 8004n;

async function main(): Promise<void> {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error('PRIVATE_KEY missing (expected in contracts/.env)');

  const provider = new JsonRpcProvider(RPC, 5003);
  const wallet = new Wallet(pk, provider); // sender (signs offline) + courier (pays gas) for this demo
  const domain: Eip712Domain = {
    name: 'Deadzone USD',
    version: '1',
    chainId: 5003,
    verifyingContract: TOKEN,
  };

  const token = new Contract(TOKEN, ['function balanceOf(address) view returns (uint256)'], provider);
  const before: bigint = await token.balanceOf(RECIPIENT);

  // 1) sign the payment OFFLINE (this is what a phone does with no internet)
  const auth = await signAuthorization(wallet, domain, {
    from: wallet.address,
    to: RECIPIENT,
    value: parseUnits('100', 18),
    validAfter: 0,
    validBefore: Math.floor(Date.now() / 1000) + 3600,
    nonce: keccak256(toUtf8Bytes(`courier-live-${Date.now()}`)),
  });

  // 2) the gateway agent settles it on Mantle
  const agent = new SettlementAgent({
    view: new RpcChainView(provider, TOKEN),
    domain,
    erc8004: new Erc8004(), // real registries wired in Phase 3
    courierAgentId: DEADZONE_AGENT_ID,
    settle: makeOnchainSettle(wallet, SETTLEMENT),
    forceFallback: !process.env.ZAI_API_KEY,
  });

  console.log('\n=== DEADZONE · LIVE settlement on Mantle Sepolia ===');
  console.log('sender   :', wallet.address);
  console.log('recipient:', RECIPIENT, `(before: ${before} wei)`);
  const { plan, outcome } = await agent.process([auth]);

  const after: bigint = await token.balanceOf(RECIPIENT);
  console.log('recipient: after', after, `| delta ${after - before} wei`);
  console.log('settle tx:', outcome.settleTx);
  console.log('explorer :', `https://sepolia.mantlescan.xyz/tx/${outcome.settleTx}`);
  console.log('landed   :', outcome.landed.map((n) => n.slice(0, 10)), '| plan:', plan.source);

  if (after - before !== parseUnits('100', 18)) {
    console.log('❌ recipient did not receive 100 dUSD');
    process.exit(1);
  }
  console.log('✅ a real payment was settled on Mantle by the autonomous agent');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
