/** Gateway API client + a client-side simulation fallback so the public site always demos. */

export interface Status {
  chain: { id: number; name: string; explorer: string };
  courier: { agentId: string; wallet: string };
  reputation: { deliveries: number; score: number };
  brain: 'glm' | 'claude' | 'deterministic';
  addresses: Record<string, string>;
  simulated?: boolean;
}

export interface PayResult {
  ok: boolean;
  plan: { source: 'llm' | 'fallback'; rationale: string; batched: boolean };
  rejected: { reason: string }[];
  steps: { at: number; line: string }[];
  txs: { preCommit: string; settle: string; attest: string };
  explorerTxs: { preCommit: string; settle: string; attest: string };
  recipientDelta: string;
  reputation: { deliveries: number; score: number };
  simulated?: boolean;
}

const EXPLORER = 'https://sepolia.mantlescan.xyz';

/** Gateway base URL: Vite env override → public Railway gateway → dev proxy fallback. */
const GATEWAY: string =
  (import.meta as any).env?.VITE_GATEWAY_URL ?? 'https://deadzone-production-268b.up.railway.app';

async function tryFetch<T>(path: string, init?: RequestInit, timeoutMs = 60_000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${GATEWAY}${path}`, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export async function getStatus(): Promise<Status> {
  try {
    return await tryFetch<Status>('/api/status', undefined, 12_000);
  } catch {
    return {
      chain: { id: 5003, name: 'Mantle Sepolia', explorer: EXPLORER },
      courier: { agentId: '1', wallet: '0x73A5021c0935b79D46C2D650821b212dC5b3b9Eb' },
      reputation: { deliveries: 1, score: 100 },
      brain: 'glm',
      addresses: {
        token: '0xEF1ec1FeA446E6a7869221F00c9DC76306edca54',
        settlement: '0xF817E6947CC94559e3e6AfF9f06fe938C3A0c652',
        identity: '0x6dd59064BC298BA85AA11a2953DA2BaA92B46382',
        validation: '0x936D1Aa670590767070Cb9Bde0264aA4d1543275',
        reputation: '0x94ddC4368F8ac592Ad41067F11E43D43CDd65d94',
      },
      simulated: true,
    };
  }
}

export async function pay(args: { to: string; amount: string; expire: boolean }): Promise<PayResult> {
  try {
    return await tryFetch<PayResult>(
      '/api/pay',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) },
      120_000,
    );
  } catch {
    return simulatePay(args);
  }
}

/** Deterministic client-side simulation matching the agent's behavior, for offline demos. */
function simulatePay(args: { to: string; amount: string; expire: boolean }): PayResult {
  const fakeTx = (tag: string) =>
    '0x' + Array.from({ length: 64 }, (_, i) => '0123456789abcdef'[(tag.charCodeAt(i % tag.length) + i * 7) % 16]).join('');
  const to = args.to.slice(0, 8);
  if (args.expire) {
    return {
      ok: false,
      plan: { source: 'llm', rationale: '[GLM] One authorization expired before it reached the gateway; rejecting it and settling nothing.', batched: false },
      rejected: [{ reason: 'expired' }],
      steps: [
        { at: 120, line: `signed ${args.amount} dUSD → ${to}… offline (gasless EIP-3009)` },
        { at: 340, line: '🔎 validated 1: 0 valid, 1 rejected (expired)' },
        { at: 900, line: '🧠 plan [llm]: [GLM] Authorization expired in transit — rejecting, nothing to settle.' },
        { at: 1500, line: '🔒 pre-committed decision → ERC-8004 (recorded the rejection)' },
        { at: 2100, line: '⛓️  nothing valid to settle — no on-chain settlement submitted' },
        { at: 2600, line: '📜 attested outcome + reputation (score 0)' },
      ],
      txs: { preCommit: fakeTx('precommit'), settle: '0xnone', attest: fakeTx('attest') },
      explorerTxs: {
        preCommit: `${EXPLORER}/tx/${fakeTx('precommit')}`,
        settle: '',
        attest: `${EXPLORER}/tx/${fakeTx('attest')}`,
      },
      recipientDelta: '0',
      reputation: { deliveries: 1, score: 100 },
      simulated: true,
    };
  }
  return {
    ok: true,
    plan: { source: 'llm', rationale: '[GLM] Single valid payment with reasonable gas — settling immediately on Mantle.', batched: false },
    rejected: [],
    steps: [
      { at: 120, line: `signed ${args.amount} dUSD → ${to}… offline (gasless EIP-3009)` },
      { at: 340, line: '🔎 validated 1: 1 valid, 0 rejected' },
      { at: 1000, line: '🧠 plan [llm]: [GLM] Single valid payment with reasonable gas — settle now.' },
      { at: 1700, line: '🔒 pre-committed decision → ERC-8004 (before settling)' },
      { at: 3200, line: '⛓️  settled 1, skipped 0 on Mantle' },
      { at: 4200, line: '📜 attested outcome + reputation (score 100)' },
    ],
    txs: { preCommit: fakeTx('precommit'), settle: fakeTx('settle'), attest: fakeTx('attest') },
    explorerTxs: {
      preCommit: `${EXPLORER}/tx/${fakeTx('precommit')}`,
      settle: `${EXPLORER}/tx/${fakeTx('settle')}`,
      attest: `${EXPLORER}/tx/${fakeTx('attest')}`,
    },
    recipientDelta: (BigInt(Math.round(Number(args.amount || '0'))) * 10n ** 18n).toString(),
    reputation: { deliveries: 2, score: 100 },
    simulated: true,
  };
}
