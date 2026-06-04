/** Core types for the DEADZONE Settlement Agent. */

/** An offline-signed EIP-3009 payment carried across the BLE mesh. */
export interface Authorization {
  from: string;
  to: string;
  value: bigint;
  validAfter: number; // unix seconds
  validBefore: number; // unix seconds
  nonce: string; // bytes32 hex
  signature: string; // 0x hex
}

export interface RejectedAuth {
  auth: Authorization;
  reason: string;
}

export interface SettlementPlan {
  settleNow: Authorization[];
  reject: RejectedAuth[];
  batched: boolean;
  gasPriceWei: bigint;
  rationale: string;
  source: 'llm' | 'fallback';
}

export interface SettlementOutcome {
  landed: string[]; // nonces settled on-chain
  skipped: string[]; // nonces that reverted at settle time
  gasUsedWei: bigint;
  settleTx: string;
  preCommitTx: string;
  attestTx: string;
  planHash: string;
}

/** Abstracts the chain reads the agent needs — real (RPC) or mocked (tests). */
export interface ChainView {
  now(): number;
  isNonceUsed(from: string, nonce: string): Promise<boolean>;
  balanceOf(addr: string): Promise<bigint>;
  gasPriceWei(): Promise<bigint>;
}

export interface Eip712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}
