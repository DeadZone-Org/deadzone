import { keccak256, toUtf8Bytes } from 'ethers';
import type { SettlementPlan } from './types.js';

export interface Erc8004Config {
  identityRegistry?: string;
  validationRegistry?: string;
  reputationRegistry?: string;
  agentId?: bigint;
}

/** Canonical hash of a settlement decision — what we pre-commit before settling. */
export function planHashOf(plan: SettlementPlan): string {
  const summary = {
    settle: plan.settleNow.map((a) => a.nonce).sort(),
    reject: plan.reject.map((r) => r.auth.nonce).sort(),
    batched: plan.batched,
    gas: plan.gasPriceWei.toString(),
  };
  return keccak256(toUtf8Bytes(JSON.stringify(summary)));
}

let simCounter = 0;
const simTx = (tag: string) => `0xSIM_${tag}_${(simCounter++).toString(16).padStart(4, '0')}`;

/**
 * ERC-8004 identity / validation / reputation writes.
 * Until the registries + a signer are configured (Phase 3) this simulates the writes
 * and logs them, so the dry-run agent always works. The interface is the real one.
 */
export class Erc8004 {
  constructor(
    private cfg: Erc8004Config = {},
    private signer?: unknown,
  ) {}

  private live(): boolean {
    return Boolean(this.cfg.validationRegistry && this.signer);
  }

  /** ValidationRegistry.validationRequest(validator, agentId, requestURI, planHash) — BEFORE settling. */
  async preCommit(planHash: string): Promise<string> {
    if (!this.live()) {
      console.warn(`[erc8004] (sim) pre-commit ${planHash.slice(0, 12)}… — no registry/signer yet`);
      return simTx('precommit');
    }
    // wired to the real registry in Phase 3
    return simTx('precommit');
  }

  /** validationResponse(...) + ReputationRegistry.giveFeedback(...) — AFTER settling. */
  async attest(
    outcome: { landed: string[]; gasUsedWei: bigint },
    score: number,
  ): Promise<{ attestTx: string; feedbackTx: string }> {
    if (!this.live()) {
      console.warn(`[erc8004] (sim) attest landed=${outcome.landed.length} score=${score}`);
      return { attestTx: simTx('attest'), feedbackTx: simTx('feedback') };
    }
    return { attestTx: simTx('attest'), feedbackTx: simTx('feedback') };
  }
}
