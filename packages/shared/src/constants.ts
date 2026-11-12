export const HOUR_NS = 3_600_000_000_000;
export const DAY_NS = 86_400_000_000_000;
export const NEAR_DECIMALS = 24;
export const DEFAULT_FT_DECIMALS = 6;
export const APPROVAL_WINDOW_MS = 24 * 60 * 60 * 1000;

export const NETWORKS = {
  testnet: {
    rpcUrl: 'https://rpc.testnet.near.org',
    explorer: 'https://testnet.nearblocks.io',
    wallet: 'https://testnet.mynearwallet.com',
    label: 'Testnet',
  },
  mainnet: {
    rpcUrl: 'https://rpc.mainnet.near.org',
    explorer: 'https://nearblocks.io',
    wallet: 'https://app.mynearwallet.com',
    label: 'Mainnet',
  },
} as const;

export const REQUEST_PAGE_SIZE = 25;
export const DEFAULT_AGENT_ALLOWANCE_YOCTO = '1000000000000000000000000'; // 1 NEAR of gas
export const DEFAULT_VAULT_FUNDING_NEAR = '3';
export const ONE_NEAR = '1000000000000000000000000';
export const STORAGE_DEPOSIT_YOCTO = '1250000000000000000000'; // 0.00125 NEAR
export const U128_MAX = '340282366920938463463374607431768211455';
