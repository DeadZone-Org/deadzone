import { Contract, JsonRpcProvider } from 'ethers';
import type { ChainView } from './types.js';

/** In-memory ChainView for tests/demo — no network. */
export class MockChainView implements ChainView {
  constructor(
    private opts: {
      now: number;
      balances: Record<string, bigint>;
      usedNonces?: Set<string>;
      gasWei?: bigint;
    },
  ) {}
  now(): number {
    return this.opts.now;
  }
  async isNonceUsed(_from: string, nonce: string): Promise<boolean> {
    return this.opts.usedNonces?.has(nonce) ?? false;
  }
  async balanceOf(addr: string): Promise<bigint> {
    return this.opts.balances[addr.toLowerCase()] ?? 0n;
  }
  async gasPriceWei(): Promise<bigint> {
    return this.opts.gasWei ?? 20_000_000n;
  }
}

const VIEW_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function authorizationState(address,bytes32) view returns (bool)',
];

/** Live ChainView backed by a Mantle RPC + the DeadzoneToken. */
export class RpcChainView implements ChainView {
  private token: Contract;
  constructor(
    private provider: JsonRpcProvider,
    tokenAddress: string,
  ) {
    this.token = new Contract(tokenAddress, VIEW_ABI, provider);
  }
  now(): number {
    return Math.floor(Date.now() / 1000);
  }
  async isNonceUsed(from: string, nonce: string): Promise<boolean> {
    return this.token.authorizationState(from, nonce);
  }
  async balanceOf(addr: string): Promise<bigint> {
    return this.token.balanceOf(addr);
  }
  async gasPriceWei(): Promise<bigint> {
    const fee = await this.provider.getFeeData();
    return fee.gasPrice ?? 20_000_000n;
  }
}
