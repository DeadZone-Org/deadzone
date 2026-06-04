/**
 * DEADZONE — Mantle chain configuration (ethers v6).
 * Shared by the Settlement Agent (agent/) and the web demo (web/).
 */

export interface ChainConfig {
  id: string;
  name: string;
  chainId: number;
  rpcUrl: string;
  explorer: string;
  faucet?: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  testnet: boolean;
}

export const MANTLE_SEPOLIA: ChainConfig = {
  id: 'mantleSepolia',
  name: 'Mantle Sepolia Testnet',
  chainId: 5003,
  rpcUrl: 'https://rpc.sepolia.mantle.xyz',
  explorer: 'https://sepolia.mantlescan.xyz',
  faucet: 'https://faucet.sepolia.mantle.xyz',
  nativeCurrency: { name: 'Mantle', symbol: 'MNT', decimals: 18 },
  testnet: true,
};

export const MANTLE_MAINNET: ChainConfig = {
  id: 'mantle',
  name: 'Mantle',
  chainId: 5000,
  rpcUrl: 'https://rpc.mantle.xyz',
  explorer: 'https://mantlescan.xyz',
  nativeCurrency: { name: 'Mantle', symbol: 'MNT', decimals: 18 },
  testnet: false,
};

/** Default network for the hackathon demo. */
export const DEFAULT_CHAIN = MANTLE_SEPOLIA;

/**
 * Deployed contract addresses — filled in after `forge create` + verify.
 * The ERC-8004 registry addresses MUST be verified on Mantlescan / 8004scan
 * before wiring; if the canonical registries are not live on 5003, deploy the
 * thin attestation fallback in contracts/ and point these there.
 */
export const ADDRESSES = {
  // Full stack deployed together to Mantle Sepolia (5003) — 2026-06-04
  deadzoneToken: '0xEF1ec1FeA446E6a7869221F00c9DC76306edca54',
  deadzoneSettlement: '0xF817E6947CC94559e3e6AfF9f06fe938C3A0c652',
  erc8004: {
    identityRegistry: '0x6dd59064BC298BA85AA11a2953DA2BaA92B46382',
    validationRegistry: '0x936D1Aa670590767070Cb9Bde0264aA4d1543275',
    reputationRegistry: '0x94ddC4368F8ac592Ad41067F11E43D43CDd65d94',
  },
} as const;

/** Mantle GasPriceOracle predeploy (read for gas-aware batching). */
export const GAS_PRICE_ORACLE = '0x420000000000000000000000000000000000000F';
