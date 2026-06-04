import { Contract, type Signer } from 'ethers';
import type { Authorization } from './types.js';
import type { SettleResult } from './settlementAgent.js';

const SETTLEMENT_ABI = [
  'function settleBatch(uint256 courierAgentId, (address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,bytes signature)[] items) returns (uint256 settledCount, uint256 failedCount)',
  'function settledBy(bytes32) view returns (uint256)',
];

/**
 * Build the live settler the SettlementAgent calls in production: submits a batch to
 * DeadzoneSettlement on Mantle (paying gas in MNT) and reports exactly which nonces landed
 * by reading `settledBy` after the tx — the on-chain attribution that feeds reputation.
 */
export function makeOnchainSettle(signer: Signer, settlementAddress: string) {
  const contract = new Contract(settlementAddress, SETTLEMENT_ABI, signer);
  return async (courierAgentId: bigint, items: Authorization[]): Promise<SettleResult> => {
    const structs = items.map((a) => ({
      from: a.from,
      to: a.to,
      value: a.value,
      validAfter: a.validAfter,
      validBefore: a.validBefore,
      nonce: a.nonce,
      signature: a.signature,
    }));
    const tx = await contract.settleBatch(courierAgentId, structs);
    const receipt = await tx.wait();

    const landed: string[] = [];
    const skipped: string[] = [];
    for (const a of items) {
      const who: bigint = await contract.settledBy(a.nonce);
      if (who === courierAgentId) landed.push(a.nonce);
      else skipped.push(a.nonce);
    }
    const gasPrice: bigint = receipt?.gasPrice ?? 0n;
    return {
      landed,
      skipped,
      gasUsedWei: (receipt?.gasUsed ?? 0n) * gasPrice,
      settleTx: tx.hash,
    };
  };
}
