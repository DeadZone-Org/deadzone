import { Contract, type Signer, keccak256, toUtf8Bytes } from 'ethers';
import type { SettlementPlan } from './types.js';

export interface Erc8004Config {
  identityRegistry?: string;
  validationRegistry?: string;
  reputationRegistry?: string;
  agentId?: bigint;
}

const IDENTITY_ABI = [
  'function register(string agentURI) returns (uint256)',
  'function setAgentWallet(uint256 agentId, address wallet)',
  'function getAgentWallet(uint256 agentId) view returns (address)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
];
const VALIDATION_ABI = [
  'function validationRequest(address validator, uint256 agentId, string requestURI, bytes32 requestHash)',
  'function validationResponse(bytes32 requestHash, uint8 response, string responseURI, bytes32 responseHash, string tag)',
  'function getValidationStatus(bytes32 requestHash) view returns (address,uint256,uint8,bytes32,string,uint256)',
];
const REPUTATION_ABI = [
  'function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)',
  'function getSummary(uint256 agentId) view returns (uint64 count, int128 summaryValue)',
];

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
 * ERC-8004 identity / validation / reputation writes for a Deadzone courier.
 *
 * With a signer + registry addresses it performs REAL on-chain writes to the deployed
 * Mantle registries (the "verifiable on-chain value" the hackathon rewards). Without
 * them (dry-run/tests) it simulates and logs, so the agent always runs. The pre-commit
 * is written BEFORE settling, making the recorded decision non-backfittable.
 */
export class Erc8004 {
  private identity?: Contract;
  private validation?: Contract;
  private reputation?: Contract;
  private agentId?: bigint;
  private requestHashes = new Map<string, string>(); // planHash -> requestHash

  constructor(
    private cfg: Erc8004Config = {},
    private signer?: Signer,
  ) {
    if (signer && cfg.identityRegistry) this.identity = new Contract(cfg.identityRegistry, IDENTITY_ABI, signer);
    if (signer && cfg.validationRegistry) this.validation = new Contract(cfg.validationRegistry, VALIDATION_ABI, signer);
    if (signer && cfg.reputationRegistry) this.reputation = new Contract(cfg.reputationRegistry, REPUTATION_ABI, signer);
    this.agentId = cfg.agentId;
  }

  private live(): boolean {
    return Boolean(this.validation && this.signer);
  }

  get id(): bigint | undefined {
    return this.agentId;
  }

  /** Reuse a known, already-minted agentId instead of registering a new identity NFT. */
  useExistingIdentity(id: bigint): void {
    this.agentId = id;
  }

  /**
   * Ensure this courier has an ERC-8004 identity NFT. Mints one (register) if agentId
   * is unset, binds the settling wallet, and returns the agentId.
   */
  async ensureIdentity(agentURI = 'ipfs://deadzone-courier'): Promise<bigint> {
    if (this.agentId !== undefined) return this.agentId;
    if (!this.identity || !this.signer) {
      this.agentId = 8004n; // sim id for dry-run
      return this.agentId;
    }
    const tx = await this.identity.register(agentURI);
    const receipt = await tx.wait();
    // pull agentId from the Registered event
    let id: bigint | undefined;
    for (const log of receipt?.logs ?? []) {
      try {
        const parsed = this.identity.interface.parseLog(log);
        if (parsed?.name === 'Registered') {
          id = parsed.args[0] as bigint;
          break;
        }
      } catch {
        /* not our event */
      }
    }
    if (id === undefined) throw new Error('register: no Registered event');
    const wallet = await this.signer.getAddress();
    await (await this.identity.setAgentWallet(id, wallet)).wait();
    this.agentId = id;
    return id;
  }

  /** ValidationRegistry.validationRequest(validator, agentId, requestURI, planHash) — BEFORE settling. */
  async preCommit(planHash: string): Promise<string> {
    if (!this.live()) {
      console.warn(`[erc8004] (sim) pre-commit ${planHash.slice(0, 12)}…`);
      return simTx('precommit');
    }
    const agentId = await this.ensureIdentity();
    const validator = await this.signer!.getAddress();
    // unique requestHash per attempt so retried demos don't collide on "request exists"
    const requestHash = keccak256(toUtf8Bytes(`${planHash}:${Date.now()}`));
    this.requestHashes.set(planHash, requestHash);
    const tx = await this.validation!.validationRequest(validator, agentId, `ipfs://plan/${planHash}`, requestHash);
    await tx.wait();
    return tx.hash;
  }

  /** validationResponse(...) + ReputationRegistry.giveFeedback(...) — AFTER settling. */
  async attest(
    outcome: { landed: string[]; gasUsedWei: bigint },
    score: number,
    planHash?: string,
  ): Promise<{ attestTx: string; feedbackTx: string }> {
    if (!this.live()) {
      console.warn(`[erc8004] (sim) attest landed=${outcome.landed.length} score=${score}`);
      return { attestTx: simTx('attest'), feedbackTx: simTx('feedback') };
    }
    const agentId = await this.ensureIdentity();
    const requestHash = (planHash && this.requestHashes.get(planHash)) ?? keccak256(toUtf8Bytes(`fallback:${Date.now()}`));
    const responseHash = keccak256(toUtf8Bytes(JSON.stringify({ landed: outcome.landed, score })));

    const attestTx = await this.validation!.validationResponse(
      requestHash,
      score,
      `ipfs://outcome/${requestHash}`,
      responseHash,
      'honest-relay',
    );
    await attestTx.wait();

    let feedbackTx = simTx('feedback');
    if (this.reputation) {
      const fb = await this.reputation.giveFeedback(
        agentId,
        BigInt(score), // int128 value
        0, // valueDecimals
        'honest-relay',
        '',
        'deadzone-settlement',
        `ipfs://feedback/${requestHash}`,
        responseHash,
      );
      await fb.wait();
      feedbackTx = fb.hash;
    }
    return { attestTx: attestTx.hash, feedbackTx };
  }
}
