/**
 * DEADZONE — real end-to-end settlement on Mantle Sepolia, WITH live ERC-8004 writes.
 *
 *   cd agent && npm run settle:live
 *
 * Offline-signs an EIP-3009 payment, then runs the agent against the LIVE deployed
 * contracts: validate -> plan (GLM/Claude/fallback) -> pre-commit to ERC-8004 ->
 * settle on Mantle -> attest outcome + reputation to ERC-8004. Proves the full
 * "verifiable on-chain value" loop on real chain. Needs PRIVATE_KEY (contracts/.env).
 */
import { Contract, JsonRpcProvider, Wallet, keccak256, parseUnits, toUtf8Bytes } from 'ethers';
import { RpcChainView } from './chainView.js';
import { Erc8004 } from './erc8004.js';
import { makeOnchainSettle } from './gateway.js';
import { SettlementAgent } from './settlementAgent.js';
import { signAuthorization } from './sign.js';
import type { Eip712Domain } from './types.js';

const RPC = process.env.MANTLE_SEPOLIA_RPC ?? 'https://rpc.sepolia.mantle.xyz';
const TOKEN = '0xEF1ec1FeA446E6a7869221F00c9DC76306edca54';
const SETTLEMENT = '0xF817E6947CC94559e3e6AfF9f06fe938C3A0c652';
const IDENTITY = '0x6dd59064BC298BA85AA11a2953DA2BaA92B46382';
const VALIDATION = '0x936D1Aa670590767070Cb9Bde0264aA4d1543275';
const REPUTATION = '0x94ddC4368F8ac592Ad41067F11E43D43CDd65d94';
const RECIPIENT = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

const ex = (h: string) => `https://sepolia.mantlescan.xyz/tx/${h}`;

async function main(): Promise<void> {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error('PRIVATE_KEY missing (expected in contracts/.env)');

  const provider = new JsonRpcProvider(RPC, 5003);
  const wallet = new Wallet(pk, provider); // sender (signs offline) + courier (pays gas) for this demo
  const domain: Eip712Domain = { name: 'Deadzone USD', version: '1', chainId: 5003, verifyingContract: TOKEN };

  const token = new Contract(TOKEN, ['function balanceOf(address) view returns (uint256)'], provider);
  const reputation = new Contract(
    REPUTATION,
    ['function getSummary(uint256) view returns (uint64,int128)'],
    provider,
  );
  const before: bigint = await token.balanceOf(RECIPIENT);

  // The courier's ERC-8004 identity (real registries + signer)
  const erc8004 = new Erc8004(
    { identityRegistry: IDENTITY, validationRegistry: VALIDATION, reputationRegistry: REPUTATION },
    wallet,
  );

  console.log('\n=== DEADZONE · LIVE settlement + ERC-8004 on Mantle Sepolia ===');
  console.log('courier wallet:', wallet.address);
  process.stdout.write('minting / loading ERC-8004 courier identity… ');
  const agentId = await erc8004.ensureIdentity('ipfs://deadzone-courier/genesis');
  console.log(`agentId #${agentId}`);

  // 1) sign the payment OFFLINE (what a phone does with no internet)
  const auth = await signAuthorization(wallet, domain, {
    from: wallet.address,
    to: RECIPIENT,
    value: parseUnits('100', 18),
    validAfter: 0,
    validBefore: Math.floor(Date.now() / 1000) + 3600,
    nonce: keccak256(toUtf8Bytes(`deadzone-live-${Date.now()}`)),
  });
  console.log('recipient:', RECIPIENT, `(before: ${before} wei)`);

  // 2) the gateway agent runs the full verifiable loop
  const agent = new SettlementAgent({
    view: new RpcChainView(provider, TOKEN),
    domain,
    erc8004,
    courierAgentId: agentId,
    settle: makeOnchainSettle(wallet, SETTLEMENT),
    forceFallback: !process.env.ZAI_API_KEY && !process.env.ANTHROPIC_API_KEY,
  });
  const { plan, outcome } = await agent.process([auth]);

  const after: bigint = await token.balanceOf(RECIPIENT);
  const [count, summary] = await reputation.getSummary(agentId);

  console.log('\n--- on-chain proof ---');
  console.log('plan        :', plan.source, '·', plan.rationale);
  console.log('recipient   :', `+${(after - before).toString()} wei (now ${after})`);
  console.log('pre-commit  :', ex(outcome.preCommitTx));
  console.log('settle      :', ex(outcome.settleTx));
  console.log('attest      :', ex(outcome.attestTx));
  console.log('reputation  :', `agent #${agentId} → ${count} delivery(ies), score ${summary}`);

  if (after - before !== parseUnits('100', 18)) {
    console.log('❌ recipient did not receive 100 dUSD');
    process.exit(1);
  }
  console.log('\n✅ payment settled AND decision/outcome recorded on-chain by the autonomous courier');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
