import type { Authorization, ChainView, RejectedAuth, SettlementPlan } from './types.js';
import { planDeterministic } from './rulesEngine.js';

const GLM_ENDPOINT = process.env.GLM_ENDPOINT ?? 'https://api.z.ai/api/paas/v4/chat/completions';
const GLM_MODEL = process.env.GLM_MODEL ?? 'glm-4.5-flash';
const ANTHROPIC_ENDPOINT = process.env.ANTHROPIC_ENDPOINT ?? 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5';

/** An LLM backend that turns (system,user) into assistant text. */
interface Provider {
  name: string; // shown in the rationale, e.g. [GLM] / [Claude]
  available(): boolean;
  complete(system: string, user: string): Promise<string>;
}

/** Z.ai GLM (primary). Reasoning model → disable thinking for a fast, direct JSON answer. */
const glm: Provider = {
  name: 'GLM',
  available: () => Boolean(process.env.ZAI_API_KEY ?? process.env.GLM_API_KEY),
  async complete(system, user) {
    const key = process.env.ZAI_API_KEY ?? process.env.GLM_API_KEY;
    const res = await fetchWithTimeout(
      GLM_ENDPOINT,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: GLM_MODEL,
          temperature: 0.2,
          max_tokens: 400,
          thinking: { type: 'disabled' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      },
      30_000,
    );
    const json: any = await res.json();
    if (json?.error) throw new Error(`GLM ${json.error.code}: ${json.error.message}`);
    return json?.choices?.[0]?.message?.content ?? '';
  },
};

/** Anthropic Claude (secondary — used only if GLM fails). */
const anthropic: Provider = {
  name: 'Claude',
  available: () => Boolean(process.env.ANTHROPIC_API_KEY),
  async complete(system, user) {
    const res = await fetchWithTimeout(
      ANTHROPIC_ENDPOINT,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 400,
          temperature: 0.2,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      },
      30_000,
    );
    const json: any = await res.json();
    if (json?.type === 'error' || json?.error) throw new Error(`Claude: ${json?.error?.message ?? 'error'}`);
    const text = Array.isArray(json?.content)
      ? json.content.filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('')
      : '';
    if (!text) throw new Error('Claude: empty response');
    return text;
  },
};

const REGISTRY: Record<string, Provider> = { glm, anthropic, claude: anthropic };

/**
 * The "AI" planner. Decides ordering / batching / hold over the ALREADY-VALIDATED set.
 * Tier order (default GLM → Claude → deterministic), configurable via LLM_ORDER.
 * Invariants: never settles a non-validated nonce; always returns a usable plan.
 */
export async function planWithLLM(
  valid: Authorization[],
  reject: RejectedAuth[],
  view: ChainView,
  opts?: { forceFallback?: boolean },
): Promise<SettlementPlan> {
  const fallback = () => planDeterministic(valid, reject, view);
  if (opts?.forceFallback || valid.length === 0) return fallback();

  const gasPriceWei = await view.gasPriceWei();
  const system =
    "You are DEADZONE's gateway settlement agent on Mantle. You receive offline-signed payments " +
    'that have ALREADY passed cryptographic validation. Decide which to settle now vs hold, whether ' +
    'to batch them (cheaper gas on Mantle), and give a one-sentence rationale. You may NEVER include a ' +
    'nonce that is not in the provided valid list. Reply ONLY as JSON: ' +
    '{"settleNonces": string[], "batched": boolean, "rationale": string}.';
  const user = JSON.stringify({
    gasPriceWei: gasPriceWei.toString(),
    valid: valid.map((a) => ({ nonce: a.nonce, from: a.from, to: a.to, value: a.value.toString() })),
    rejected: reject.map((r) => ({ nonce: r.auth.nonce, reason: r.reason })),
  });
  const byNonce = new Map(valid.map((a) => [a.nonce, a]));

  const order = (process.env.LLM_ORDER ?? 'glm,anthropic')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const retries = Number(process.env.LLM_RETRIES ?? 1); // per provider

  for (const name of order) {
    const provider = REGISTRY[name];
    if (!provider || !provider.available()) continue;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const text = await provider.complete(system, user);
        const decision = JSON.parse(extractJson(text));
        const settleNow = ((decision.settleNonces as string[]) ?? [])
          .map((n) => byNonce.get(n))
          .filter((a): a is Authorization => Boolean(a)); // enforces the invariant
        if (settleNow.length === 0) throw new Error('model returned no settleable nonces');

        return {
          settleNow,
          reject,
          batched: Boolean(decision.batched) && settleNow.length > 1,
          gasPriceWei,
          rationale: `[${provider.name}] ${decision.rationale ?? 'settle validated payments'}`,
          source: 'llm',
        };
      } catch (err) {
        if (process.env.DEADZONE_DEBUG) {
          console.error(`[${provider.name}] attempt ${attempt + 1}/${retries + 1} failed: ${(err as Error)?.message ?? err}`);
        }
        if (attempt < retries) await sleep(500 * (attempt + 1));
      }
    }
    // provider exhausted → fall through to the next tier
  }

  return fallback();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Pull a JSON object out of an LLM reply, tolerating ```json fences / prose around it. */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start >= 0 && end > start ? body.slice(start, end + 1) : '{}';
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}
