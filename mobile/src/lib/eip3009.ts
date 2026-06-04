import { Wallet, keccak256, toUtf8Bytes } from 'ethers';
import { TOKEN, CHAIN } from '../theme';

/** EIP-712 domain + type for the Deadzone token's transferWithAuthorization (must match the contract). */
export const DOMAIN = {
  name: TOKEN.name,
  version: '1',
  chainId: CHAIN.id,
  verifyingContract: TOKEN.address,
};

export const TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};

/** A payment, ready to ride the mesh — value is a string so it survives JSON/BLE serialization. */
export interface WireAuth {
  from: string;
  to: string;
  value: string; // wei
  validAfter: number;
  validBefore: number;
  nonce: string;
  signature: string;
}

/**
 * Sign a payment OFFLINE (no RPC, no internet). This is the core "send with no signal"
 * primitive — pure local cryptography over the phone's key.
 */
export async function signOffline(
  wallet: Wallet,
  params: { to: string; valueWei: bigint; ttlSeconds?: number },
): Promise<WireAuth> {
  const validBefore = Math.floor(Date.now() / 1000) + (params.ttlSeconds ?? 3600);
  const nonce = keccak256(toUtf8Bytes(`deadzone-${wallet.address}-${Date.now()}-${Math.random()}`));
  const msg = {
    from: wallet.address,
    to: params.to,
    value: params.valueWei,
    validAfter: 0,
    validBefore,
    nonce,
  };
  const signature = await wallet.signTypedData(DOMAIN, TYPES, msg);
  return { ...msg, value: params.valueWei.toString(), signature };
}
