import type { Authorization, ChainView, RejectedAuth, SettlementPlan } from './types.js';

const short = (h: string) => h.slice(0, 10);

/**
 * Deterministic planner — the safety net. Always produces a valid plan even with
 * no LLM/key/network. Settles all valid auths, batching when there is more than one.
 */
export async function planDeterministic(
  valid: Authorization[],
  reject: RejectedAuth[],
  view: ChainView,
): Promise<SettlementPlan> {
  const gasPriceWei = await view.gasPriceWei();
  const batched = valid.length > 1;
  const rejectSummary = reject.length
    ? reject.map((r) => `${short(r.auth.nonce)}:${r.reason}`).join(', ')
    : 'none';
  const rationale =
    `Validated ${valid.length + reject.length} authorizations · ` +
    `${reject.length} rejected (${rejectSummary}) · ` +
    `${valid.length} valid · ` +
    `${batched ? `batching ${valid.length} into one settlement` : 'single settlement'} · ` +
    `gas ${gasPriceWei} wei.`;
  return { settleNow: valid, reject, batched, gasPriceWei, rationale, source: 'fallback' };
}
