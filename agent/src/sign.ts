import type { Signer, Wallet } from 'ethers';
import { EIP3009_TYPES } from './validate.js';
import type { Authorization, Eip712Domain } from './types.js';

/**
 * Sign an EIP-3009 payment OFFLINE (no RPC). Reused by the demo, the web dApp, and the
 * Android app — this is the "sign with no internet" primitive.
 */
export async function signAuthorization(
  signer: Wallet | Signer,
  domain: Eip712Domain,
  p: {
    from: string;
    to: string;
    value: bigint;
    validAfter: number;
    validBefore: number;
    nonce: string;
  },
): Promise<Authorization> {
  const signature = await signer.signTypedData(
    domain,
    EIP3009_TYPES as unknown as Record<string, Array<{ name: string; type: string }>>,
    {
      from: p.from,
      to: p.to,
      value: p.value,
      validAfter: p.validAfter,
      validBefore: p.validBefore,
      nonce: p.nonce,
    },
  );
  return { ...p, signature };
}
