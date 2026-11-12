export const REASON_CODES = [
  'VAULT_PAUSED',
  'AGENT_FROZEN',
  'POLICY_EXPIRED',
  'INVALID_INPUT',
  'ASSET_NOT_ALLOWED',
  'PAYEE_NOT_ALLOWED',
  'DEST_ASSET_NOT_ALLOWED',
  'PER_TX_CAP_EXCEEDED',
  'RATE_LIMIT_EXCEEDED',
  'DAILY_CAP_EXCEEDED',
  'INSUFFICIENT_BALANCE',
  'TRANSFER_FAILED',
  'OWNER_REJECTED',
  'APPROVAL_EXPIRED',
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

export interface ReasonMessage {
  message: string;
  hint: string;
  /** Human label used in badges and reports. */
  label: string;
}

export const REASON_MESSAGES: Record<ReasonCode, ReasonMessage> = {
  VAULT_PAUSED: {
    label: 'Vault paused',
    message: 'Vault is paused by the owner',
    hint: 'Stop. Notify the owner.',
  },
  AGENT_FROZEN: {
    label: 'Agent frozen',
    message: 'This agent is frozen',
    hint: 'Stop. Notify the owner.',
  },
  POLICY_EXPIRED: {
    label: 'Policy expired',
    message: "Agent's policy has expired",
    hint: 'Stop. Ask the owner to renew.',
  },
  INVALID_INPUT: {
    label: 'Invalid input',
    message: 'Malformed request',
    hint: 'Fix the arguments.',
  },
  ASSET_NOT_ALLOWED: {
    label: 'Asset not allowed',
    message: 'This asset is not permitted',
    hint: 'Use an allowed asset.',
  },
  PAYEE_NOT_ALLOWED: {
    label: 'Payee not allowed',
    message: "Recipient is not on this agent's allowlist",
    hint: 'Do not retry. Ask the owner to allowlist the payee.',
  },
  DEST_ASSET_NOT_ALLOWED: {
    label: 'Destination asset not allowed',
    message: 'Destination asset not permitted for this payee',
    hint: 'Use an allowed destination asset.',
  },
  PER_TX_CAP_EXCEEDED: {
    label: 'Per-payment cap exceeded',
    message: 'Amount exceeds the per-payment limit',
    hint: 'Retry with a smaller amount only if it serves the task.',
  },
  RATE_LIMIT_EXCEEDED: {
    label: 'Rate limit exceeded',
    message: 'Too many requests this hour',
    hint: 'Back off for the rest of the hour.',
  },
  DAILY_CAP_EXCEEDED: {
    label: 'Daily cap exceeded',
    message: 'Daily budget would be exceeded',
    hint: 'Wait until the daily window resets or ask the owner.',
  },
  INSUFFICIENT_BALANCE: {
    label: 'Insufficient balance',
    message: 'Vault balance too low',
    hint: 'Notify the owner.',
  },
  TRANSFER_FAILED: {
    label: 'Transfer failed',
    message: 'On-chain transfer failed after approval',
    hint: 'Check request status; notify the owner.',
  },
  OWNER_REJECTED: {
    label: 'Rejected by owner',
    message: 'The owner rejected this request',
    hint: 'Stop. Do not retry this payment.',
  },
  APPROVAL_EXPIRED: {
    label: 'Approval expired',
    message: 'The approval window expired',
    hint: 'Ask the owner to allow a fresh request.',
  },
};

export function isReasonCode(value: string): value is ReasonCode {
  return (REASON_CODES as readonly string[]).includes(value);
}

export function reasonLabel(code: string | null | undefined): string {
  if (!code) return 'None';
  return isReasonCode(code) ? REASON_MESSAGES[code].label : code;
}
