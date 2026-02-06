export type { TxReceipt, ExportData } from '@invariance/common';

export type WalletProvider =
  | 'coinbase-wallet'
  | 'coinbase-smart-wallet'
  | 'metamask'
  | 'walletconnect'
  | 'privy'
  | 'dynamic'
  | 'turnkey'
  | 'safe'
  | 'ledger'
  | 'raw'
  | 'custom';

export interface WalletInfo {
  address: string;
  provider: WalletProvider;
  chainId: number;
  connected: boolean;
  isSmartAccount: boolean;
  identityId?: string | undefined;
}

export interface BalanceInfo {
  usdc: string;
  eth: string;
  address: string;
}

export interface FundOptions {
  amount: string;
  token?: 'USDC' | undefined;
}

export interface CreateWalletOptions {
  provider?: WalletProvider | undefined;
  label?: string | undefined;
}

export interface ConnectOptions {
  provider?: WalletProvider | undefined;
  chainId?: number | undefined;
}
