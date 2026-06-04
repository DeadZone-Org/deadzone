/**
 * Deadzone online gateway.
 *
 * In the real product this is the node with internet that receives an offline-signed
 * payment off the Bluetooth mesh and runs the autonomous Settlement Agent. Here it's a
 * small HTTP server wrapping @deadzone/agent so the web dApp can drive a REAL settlement
 * (validate → plan via GLM/Claude → pre-commit to ERC-8004 → settle on Mantle → attest).
 *
 *   cd gateway && npm run dev      # http://localhost:8787
 */
import cors from 'cors';
import express from 'express';
import { Contract, JsonRpcProvider, Wallet, keccak256, parseUnits, toUtf8Bytes } from 'ethers';
import {
  Erc8004,
  RpcChainView,
  SettlementAgent,
  makeOnchainSettle,
  signAuthorization,
} from '../../agent/src/index.js';
import type { Eip712Domain } from '../../agent/src/index.js';

const RPC = process.env.MANTLE_SEPOLIA_RPC ?? 'https://rpc.sepolia.mantle.xyz';
const PORT = Number(process.env.PORT ?? 8787);
const A = {
  token: '0xEF1ec1FeA446E6a7869221F00c9DC76306edca54',
  settlement: '0xF817E6947CC94559e3e6AfF9f06fe938C3A0c652',
  identity: '0x6dd59064BC298BA85AA11a2953DA2BaA92B46382',
  validation: '0x936D1Aa670590767070Cb9Bde0264aA4d1543275',
  reputation: '0x94ddC4368F8ac592Ad41067F11E43D43CDd65d94',
};
const EXPLORER = 'https://sepolia.mantlescan.xyz';

const pk = process.env.PRIVATE_KEY;
if (!pk) throw new Error('PRIVATE_KEY missing (gateway needs the courier/deployer key from contracts/.env)');

const provider = new JsonRpcProvider(RPC, 5003);
const wallet = new Wallet(pk, provider);
const domain: Eip712Domain = { name: 'Deadzone USD', version: '1', chainId: 5003, verifyingContract: A.token };
const token = new Contract(
  A.token,
  ['function balanceOf(address) view returns (uint256)', 'function symbol() view returns (string)'],
  provider,
);
const reputationView = new Contract(
  A.reputation,
  ['function getSummary(uint256) view returns (uint64,int128)'],
  provider,
);
const erc8004 = new Erc8004(
  { identityRegistry: A.identity, validationRegistry: A.validation, reputationRegistry: A.reputation },
  wallet,
);
const settle = makeOnchainSettle(wallet, A.settlement);

let agentId: bigint | undefined = process.env.COURIER_AGENT_ID ? BigInt(process.env.COURIER_AGENT_ID) : undefined;
async function courierId(): Promise<bigint> {
  if (agentId !== undefined) {
    erc8004.useExistingIdentity(agentId);
    return agentId;
  }
  agentId = await erc8004.ensureIdentity('ipfs://deadzone-courier/genesis');
  return agentId;
}

const app = express();
app.use(cors());
app.use(express.json());

/** Courier identity, on-chain reputation, brain availability. */
app.get('/api/status', async (_req, res) => {
  try {
    const id = await courierId();
    const [count, score] = await reputationView.getSummary(id);
    res.json({
      chain: { id: 5003, name: 'Mantle Sepolia', explorer: EXPLORER },
      courier: { agentId: id.toString(), wallet: wallet.address },
      reputation: { deliveries: Number(count), score: Number(score) },
      brain: process.env.ZAI_API_KEY ? 'glm' : process.env.ANTHROPIC_API_KEY ? 'claude' : 'deterministic',
      addresses: A,
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** Pay endpoint — the full offline-signed → mesh → gateway-settles loop, returned as steps. */
app.post('/api/pay', async (req, res) => {
  const to: string = req.body?.to ?? '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
  const amount: string = String(req.body?.amount ?? '100');
  const expire = Boolean(req.body?.expire); // demo flag: sign an already-expired auth to show a live rejection

  const steps: { at: number; line: string }[] = [];
  const t0 = Date.now();
  const log = (line: string) => steps.push({ at: Date.now() - t0, line });

  try {
    const id = await courierId();
    const beforeBal: bigint = await token.balanceOf(to);

    // 1) offline-sign (this is what a phone does with no internet)
    const auth = await signAuthorization(wallet, domain, {
      from: wallet.address,
      to,
      value: parseUnits(amount, 18),
      validAfter: 0,
      validBefore: expire ? 1 : Math.floor(Date.now() / 1000) + 3600,
      nonce: keccak256(toUtf8Bytes(`deadzone-${Date.now()}-${Math.round(Number(amount))}`)),
    });
    log(`signed ${amount} dUSD → ${to.slice(0, 8)}… offline (gasless EIP-3009)`);

    // 2) gateway agent runs the verifiable loop
    const agent = new SettlementAgent({
      view: new RpcChainView(provider, A.token),
      domain,
      erc8004,
      courierAgentId: id,
      settle,
      forceFallback: !process.env.ZAI_API_KEY && !process.env.ANTHROPIC_API_KEY,
      log,
    });
    const { plan, outcome } = await agent.process([auth]);

    const afterBal: bigint = await token.balanceOf(to);
    const [count, score] = await reputationView.getSummary(id);

    res.json({
      ok: outcome.landed.length > 0,
      plan: { source: plan.source, rationale: plan.rationale, batched: plan.batched },
      rejected: plan.reject.map((r) => ({ reason: r.reason })),
      steps,
      txs: {
        preCommit: outcome.preCommitTx,
        settle: outcome.settleTx,
        attest: outcome.attestTx,
      },
      explorerTxs: {
        preCommit: `${EXPLORER}/tx/${outcome.preCommitTx}`,
        settle: `${EXPLORER}/tx/${outcome.settleTx}`,
        attest: `${EXPLORER}/tx/${outcome.attestTx}`,
      },
      recipientDelta: (afterBal - beforeBal).toString(),
      reputation: { deliveries: Number(count), score: Number(score) },
    });
  } catch (e) {
    log(`error: ${(e as Error).message}`);
    res.status(500).json({ ok: false, steps, error: (e as Error).message });
  }
});

app.listen(PORT, () => {
  console.log(`Deadzone gateway on http://localhost:${PORT}`);
  console.log(`courier wallet ${wallet.address}`);
});
