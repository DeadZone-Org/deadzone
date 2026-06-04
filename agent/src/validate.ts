import { verifyTypedData } from 'ethers';
import type { Authorization, ChainView, Eip712Domain } from './types.js';

/** EIP-712 type for EIP-3009 transferWithAuthorization — must match DeadzoneToken.sol. */
export const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

/** Recover the address that signed an authorization (off-chain, no RPC). */
export function recoverSigner(a: Authorization, domain: Eip712Domain): string {
  return verifyTypedData(
    domain,
    EIP3009_TYPES as unknown as Record<string, Array<{ name: string; type: string }>>,
    {
      from: a.from,
      to: a.to,
      value: a.value,
      validAfter: a.validAfter,
      validBefore: a.validBefore,
      nonce: a.nonce,
    },
    a.signature,
  );
}

/**
 * Deterministic, AUTHORITATIVE validation. The LLM planner can never settle an
 * authorization that fails here. Checks signature, time window, nonce, balance.
 */
export async function validateAuth(
  a: Authorization,
  view: ChainView,
  domain: Eip712Domain,
): Promise<{ ok: boolean; reason?: string }> {
  let recovered: string;
  try {
    recovered = recoverSigner(a, domain);
  } catch {
    return { ok: false, reason: 'bad signature encoding' };
  }
  if (recovered.toLowerCase() !== a.from.toLowerCase()) return { ok: false, reason: 'signature mismatch' };

  const now = view.now();
  if (now <= a.validAfter) return { ok: false, reason: 'not yet valid' };
  if (now >= a.validBefore) return { ok: false, reason: 'expired' };

  if (await view.isNonceUsed(a.from, a.nonce)) return { ok: false, reason: 'nonce already used' };
  if ((await view.balanceOf(a.from)) < a.value) return { ok: false, reason: 'insufficient balance' };

  return { ok: true };
}
