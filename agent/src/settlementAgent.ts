import { Erc8004, planHashOf } from './erc8004.js';
import { planWithLLM } from './llmAgent.js';
import type {
  Authorization,
  ChainView,
  Eip712Domain,
  RejectedAuth,
  SettlementOutcome,
  SettlementPlan,
} from './types.js';
import { validateAuth } from './validate.js';

/** Result of settling a batch on-chain (provided by the gateway in live mode). */
export interface SettleResult {
  landed: string[];
  skipped: string[];
  gasUsedWei: bigint;
  settleTx: string;
}

export interface SettlementDeps {
  view: ChainView;
  domain: Eip712Domain;
  erc8004: Erc8004;
  courierAgentId: bigint;
  /** Live settler (DeadzoneSettlement.settleBatch). Omit for dry-run. */
  settle?: (courierAgentId: bigint, items: Authorization[]) => Promise<SettleResult>;
  forceFallback?: boolean;
  log?: (line: string) => void;
}

export interface ProcessResult {
  plan: SettlementPlan;
  outcome: SettlementOutcome;
}

/**
 * The autonomous gateway agent. One pass = the 6-step loop:
 * validate -> plan (LLM+fallback) -> pre-commit -> settle -> attest -> (self-correct).
 */
export class SettlementAgent {
  constructor(private deps: SettlementDeps) {}

  private log(l: string): void {
    (this.deps.log ?? console.log)(l);
  }

  async process(queue: Authorization[], opts?: { dryRun?: boolean }): Promise<ProcessResult> {
    const dryRun = opts?.dryRun ?? !this.deps.settle;

    // 1. VALIDATE (authoritative)
    const valid: Authorization[] = [];
    const reject: RejectedAuth[] = [];
    for (const a of queue) {
      const r = await validateAuth(a, this.deps.view, this.deps.domain);
      if (r.ok) valid.push(a);
      else reject.push({ auth: a, reason: r.reason ?? 'invalid' });
    }
    this.log(
      `🔎 validated ${queue.length}: ${valid.length} valid, ${reject.length} rejected` +
        (reject.length ? ` (${reject.map((r) => r.reason).join(', ')})` : ''),
    );

    // 2. PLAN (the AI)
    const plan = await planWithLLM(valid, reject, this.deps.view, {
      forceFallback: this.deps.forceFallback,
    });
    this.log(`🧠 plan [${plan.source}]: ${plan.rationale}`);

    // 3. PRE-COMMIT to ERC-8004 (before settling → non-backfittable)
    const planHash = planHashOf(plan);
    const preCommitTx = await this.deps.erc8004.preCommit(planHash);
    this.log(`🔒 pre-committed decision → ERC-8004 (${planHash.slice(0, 12)}…) tx ${preCommitTx}`);

    // 4. SETTLE on Mantle
    let landed: string[] = [];
    let skipped: string[] = [];
    let gasUsedWei = 0n;
    let settleTx = '0xSIM_settle';
    if (dryRun || !this.deps.settle) {
      landed = plan.settleNow.map((a) => a.nonce);
      gasUsedWei = plan.gasPriceWei * BigInt(21_000 * Math.max(1, plan.settleNow.length));
      this.log(`⛓️  (dry-run) settled ${landed.length} payment(s) on Mantle${plan.batched ? ' (batched)' : ''}`);
    } else {
      const res = await this.deps.settle(this.deps.courierAgentId, plan.settleNow);
      landed = res.landed;
      skipped = res.skipped;
      gasUsedWei = res.gasUsedWei;
      settleTx = res.settleTx;
      this.log(`⛓️  settled ${landed.length}, skipped ${skipped.length} on Mantle · tx ${settleTx}`);
    }

    // 5. ATTEST outcome + reputation
    const total = landed.length + skipped.length;
    const score = total === 0 ? 0 : Math.round((landed.length / total) * 100);
    const { attestTx } = await this.deps.erc8004.attest({ landed, gasUsedWei }, score);
    this.log(`📜 attested outcome + reputation (score ${score}) tx ${attestTx}`);

    return {
      plan,
      outcome: { landed, skipped, gasUsedWei, settleTx, preCommitTx, attestTx, planHash },
    };
  }
}
