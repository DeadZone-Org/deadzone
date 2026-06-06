import { getBytes, hexlify, toBeHex } from 'ethers';
import type { WireAuth } from './eip3009';

/**
 * Compact binary encoding of a signed authorization for the Bluetooth mesh.
 * JSON is ~400 bytes (→ ~67 fragments); this packs the same data into 158 bytes
 * (→ ~20 fragments at 8 bytes/chunk), which transfers far faster + more reliably.
 * validAfter is always 0, so it's omitted.
 *
 * Layout:  from[20] to[20] value[16] validBefore[5] nonce[32] signature[65] = 158
 */
const LEN = 158;

export function encodeAuth(a: WireAuth): Uint8Array {
  const out = new Uint8Array(LEN);
  out.set(getBytes(a.from), 0);
  out.set(getBytes(a.to), 20);
  out.set(getBytes(toBeHex(BigInt(a.value), 16)), 40);
  out.set(getBytes(toBeHex(BigInt(a.validBefore), 5)), 56);
  out.set(getBytes(a.nonce), 61);
  out.set(getBytes(a.signature), 93);
  return out;
}

export function decodeAuth(b: Uint8Array): WireAuth {
  return {
    from: hexlify(b.slice(0, 20)),
    to: hexlify(b.slice(20, 40)),
    value: BigInt(hexlify(b.slice(40, 56))).toString(),
    validAfter: 0,
    validBefore: Number(BigInt(hexlify(b.slice(56, 61)))),
    nonce: hexlify(b.slice(61, 93)),
    signature: hexlify(b.slice(93, 158)),
  };
}
