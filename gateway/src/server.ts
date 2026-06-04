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
import { Cooldown, LIMITS, RateLimiter, checkAddress, checkAmount } from './guards.js';

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
app.use(express.json({ limit: '64kb' }));

// safety: bound every endpoint (the gateway holds the courier key + pays gas)
const limiter = new RateLimiter();
const faucetCooldown = new Cooldown();
const clientKey = (req: express.Request) =>
  (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'anon';
app.use('/api/', (req, res, next) => {
  if (req.method === 'POST' && !limiter.allow(clientKey(req))) {
    res.status(429).json({ error: 'rate limit — slow down' });
    return;
  }
  next();
});

app.get('/health', (_req, res) => res.json({ ok: true, service: 'deadzone-gateway' }));

/** dUSD balance of an address (so the app never needs to talk to an RPC directly). */
app.get('/api/balance/:address', async (req, res) => {
  const c = checkAddress(req.params.address);
  if (!c.ok) {
    res.status(400).json({ error: c.error });
    return;
  }
  try {
    const bal: bigint = await token.balanceOf(c.value);
    res.json({ address: c.value, balance: bal.toString() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

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

interface IncomingAuth {
  from: string;
  to: string;
  value: string; // wei (string)
  validAfter: number;
  validBefore: number;
  nonce: string;
  signature: string;
}

/** Run the autonomous agent on one authorization and return the structured result. */
async function settleAuth(auth: {
  from: string;
  to: string;
  value: bigint;
  validAfter: number;
  validBefore: number;
  nonce: string;
  signature: string;
}) {
  const steps: { at: number; line: string }[] = [];
  const t0 = Date.now();
  const log = (line: string) => steps.push({ at: Date.now() - t0, line });

  const id = await courierId();
  const beforeBal: bigint = await token.balanceOf(auth.to);
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
  const afterBal: bigint = await token.balanceOf(auth.to);
  const [count, score] = await reputationView.getSummary(id);

  return {
    ok: outcome.landed.length > 0,
    plan: { source: plan.source, rationale: plan.rationale, batched: plan.batched },
    rejected: plan.reject.map((r) => ({ reason: r.reason })),
    steps,
    txs: { preCommit: outcome.preCommitTx, settle: outcome.settleTx, attest: outcome.attestTx },
    explorerTxs: {
      preCommit: `${EXPLORER}/tx/${outcome.preCommitTx}`,
      settle: `${EXPLORER}/tx/${outcome.settleTx}`,
      attest: `${EXPLORER}/tx/${outcome.attestTx}`,
    },
    recipientDelta: (afterBal - beforeBal).toString(),
    reputation: { deliveries: Number(count), score: Number(score) },
  };
}

/** Pay — the gateway signs on behalf of its own wallet (web demo convenience). */
app.post('/api/pay', async (req, res) => {
  const expire = Boolean(req.body?.expire);
  const toCheck = checkAddress(req.body?.to ?? '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC');
  if (!toCheck.ok) {
    res.status(400).json({ ok: false, error: toCheck.error });
    return;
  }
  const amtCheck = checkAmount(req.body?.amount ?? '100');
  if (!amtCheck.ok) {
    res.status(400).json({ ok: false, error: amtCheck.error });
    return;
  }
  const to = toCheck.value;
  try {
    const auth = await signAuthorization(wallet, domain, {
      from: wallet.address,
      to,
      value: amtCheck.value,
      validAfter: 0,
      validBefore: expire ? 1 : Math.floor(Date.now() / 1000) + 3600,
      nonce: keccak256(toUtf8Bytes(`deadzone-${Date.now()}-${Math.random()}`)),
    });
    const result = await settleAuth(auth);
    result.steps.unshift({ at: 0, line: `signed ${req.body?.amount ?? '100'} dUSD → ${to.slice(0, 8)}… offline (gasless EIP-3009)` });
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, steps: [], error: (e as Error).message });
  }
});

/** Relay — settle an authorization that a PHONE signed offline and the mesh carried in. */
app.post('/api/relay', async (req, res) => {
  const a = req.body?.auth as IncomingAuth | undefined;
  if (!a?.signature || !a?.from || !a?.to) {
    res.status(400).json({ ok: false, error: 'missing auth fields' });
    return;
  }
  const fromCheck = checkAddress(a.from);
  const toCheck = checkAddress(a.to);
  if (!fromCheck.ok || !toCheck.ok) {
    res.status(400).json({ ok: false, error: 'invalid from/to address' });
    return;
  }
  let value: bigint;
  try {
    value = BigInt(a.value);
  } catch {
    res.status(400).json({ ok: false, error: 'invalid value' });
    return;
  }
  if (value <= 0n || value > BigInt(LIMITS.maxPayAmount) * 10n ** 18n) {
    res.status(400).json({ ok: false, error: `value out of range (cap ${LIMITS.maxPayAmount} dUSD)` });
    return;
  }
  try {
    const result = await settleAuth({
      from: fromCheck.value,
      to: toCheck.value,
      value,
      validAfter: Number(a.validAfter),
      validBefore: Number(a.validBefore),
      nonce: a.nonce,
      signature: a.signature,
    });
    result.steps.unshift({ at: 0, line: `received off the mesh: ${a.from.slice(0, 8)}… → ${a.to.slice(0, 8)}…` });
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, steps: [], error: (e as Error).message });
  }
});

/** Faucet — mint a FIXED demo grant to a fresh phone wallet, once per cooldown per address. */
app.post('/api/faucet', async (req, res) => {
  const addrCheck = checkAddress(req.body?.address);
  if (!addrCheck.ok) {
    res.status(400).json({ ok: false, error: addrCheck.error });
    return;
  }
  const to = addrCheck.value;
  const cd = faucetCooldown.check(to);
  if (!cd.ok) {
    res.status(429).json({ ok: false, error: `faucet cooldown — retry in ${Math.ceil(cd.retryInMs / 1000)}s` });
    return;
  }
  try {
    const tokenRw = new Contract(
      A.token,
      ['function mint(address,uint256)', 'function balanceOf(address) view returns (uint256)'],
      wallet,
    );
    const tx = await tokenRw.mint(to, parseUnits(String(LIMITS.faucetAmount), 18)); // fixed grant; ignores client amount
    await tx.wait();
    faucetCooldown.mark(to);
    const bal: bigint = await tokenRw.balanceOf(to);
    res.json({ ok: true, tx: tx.hash, explorer: `${EXPLORER}/tx/${tx.hash}`, balance: bal.toString() });
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

app.listen(PORT, () => {
  console.log(`Deadzone gateway on http://localhost:${PORT}`);
  console.log(`courier wallet ${wallet.address}`);
});
