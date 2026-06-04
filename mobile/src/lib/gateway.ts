import Constants from 'expo-constants';
import type { WireAuth } from './eip3009';

/** Base URL of the Deadzone gateway (the online node that settles on Mantle). */
export const GATEWAY_URL: string =
  (Constants.expoConfig?.extra as any)?.gatewayUrl ?? 'http://localhost:8787';

export interface SettleResult {
  ok: boolean;
  plan?: { source: string; rationale: string };
  rejected?: { reason: string }[];
  txs?: { preCommit: string; settle: string; attest: string };
  explorerTxs?: { preCommit: string; settle: string; attest: string };
  recipientDelta?: string;
  reputation?: { deliveries: number; score: number };
  error?: string;
}

async function post<T>(path: string, body: unknown, timeoutMs = 120_000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${GATEWAY_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

/** Mint demo dUSD to this device's wallet so it has something to send. */
export function faucet(address: string, amount = '1000') {
  return post<{ ok: boolean; tx?: string; balance?: string; error?: string }>('/api/faucet', { address, amount });
}

/** Forward a phone-signed authorization to the gateway to settle on Mantle. */
export function relay(auth: WireAuth) {
  return post<SettleResult>('/api/relay', { auth });
}

/** Read an address's dUSD balance via the gateway (no in-app RPC). */
export async function balance(address: string): Promise<bigint> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(`${GATEWAY_URL}/api/balance/${address}`, { signal: ctrl.signal });
    const json = (await res.json()) as { balance?: string };
    return BigInt(json.balance ?? '0');
  } finally {
    clearTimeout(t);
  }
}

export async function status(): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(`${GATEWAY_URL}/api/status`, { signal: ctrl.signal });
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}
