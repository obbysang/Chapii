import { z } from "zod";

export const REASON_CODES = [
  "VAULT_PAUSED",
  "AGENT_FROZEN",
  "POLICY_EXPIRED",
  "INVALID_INPUT",
  "ASSET_NOT_ALLOWED",
  "PAYEE_NOT_ALLOWED",
  "DEST_ASSET_NOT_ALLOWED",
  "PER_TX_CAP_EXCEEDED",
  "RATE_LIMIT_EXCEEDED",
  "DAILY_CAP_EXCEEDED",
  "INSUFFICIENT_BALANCE",
  "TRANSFER_FAILED",
  "OWNER_REJECTED",
  "APPROVAL_EXPIRED",
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

export const REASON_MESSAGES: Record<ReasonCode, { message: string; hint: string }> = {
  PAYEE_NOT_ALLOWED: {
    message: "Recipient is not on this agent's allowlist",
    hint: "Do not retry. Ask the owner to allowlist the payee",
  },
  PER_TX_CAP_EXCEEDED: {
    message: "Amount exceeds the per-payment limit",
    hint: "Retry with a smaller amount only if it serves the task",
  },
  DAILY_CAP_EXCEEDED: {
    message: "Daily budget would be exceeded",
    hint: "Wait until the daily window resets or ask the owner",
  },
  RATE_LIMIT_EXCEEDED: {
    message: "Too many requests this hour",
    hint: "Back off for the rest of the hour",
  },
  AGENT_FROZEN: { message: "This agent is frozen", hint: "Stop. Notify the owner" },
  VAULT_PAUSED: { message: "Vault is paused by the owner", hint: "Stop. Notify the owner" },
  POLICY_EXPIRED: { message: "Agent's policy has expired", hint: "Stop. Ask the owner to renew" },
  ASSET_NOT_ALLOWED: { message: "This asset is not permitted", hint: "Use an allowed asset" },
  DEST_ASSET_NOT_ALLOWED: {
    message: "Destination asset not permitted for this payee",
    hint: "Use an allowed destination asset",
  },
  INVALID_INPUT: { message: "Malformed request", hint: "Fix the arguments" },
  INSUFFICIENT_BALANCE: { message: "Vault balance too low", hint: "Notify the owner" },
  TRANSFER_FAILED: {
    message: "On-chain transfer failed after approval",
    hint: "Check request status; notify the owner",
  },
  OWNER_REJECTED: { message: "Rejected by the owner", hint: "Ask the owner what to do next" },
  APPROVAL_EXPIRED: { message: "Approval window expired", hint: "Ask the owner for a fresh approval" },
};

export type Asset = { NEAR: true } | { FT: string } | string;

export const assetSchema = z.union([
  z.literal("NEAR"),
  z.string().regex(/^ft:[a-z0-9][a-z0-9._-]*$/),
  z.object({ NEAR: z.boolean() }),
  z.object({ FT: z.string() }),
]);

export const assetLimitSchema = z.object({
  asset: z.string(),
  per_tx_max: z.string().regex(/^\d+$/),
  daily_max: z.string().regex(/^\d+$/),
  cosign_above: z.string().regex(/^\d+$/).nullable().optional(),
});

export const payeeSchema = z.object({
  label: z.string().max(40),
  chain: z.string().regex(/^[a-z0-9-]{2,16}$/i),
  address: z.string().min(1),
  allowed_dest_assets: z.array(z.string()),
});

export const policySchema = z.object({
  limits: z.array(assetLimitSchema).min(1).max(8),
  payees: z.array(payeeSchema).max(50),
  max_requests_per_hour: z.number().int().min(1).max(200),
  freeze_after_violations: z.number().int().min(0).max(20),
  expires_at_ns: z.string().nullable().optional(),
});

export const paymentArgsSchema = z.object({
  client_ref: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),
  asset: z.string(),
  amount: z.string().regex(/^\d+$/),
  chain: z.string().regex(/^[a-z0-9-]{2,16}$/i),
  address: z.string().min(1),
  dest_asset: z.string().optional(),
  memo: z.string().max(140).optional(),
});

export type PaymentArgs = z.infer<typeof paymentArgsSchema>;
export type Policy = z.infer<typeof policySchema>;

export type Decision =
  | { decision: "APPROVED"; requestId: number; txHash: string }
  | { decision: "PENDING_APPROVAL"; requestId: number; txHash: string }
  | { decision: "REJECTED"; requestId: number; reason: ReasonCode; message: string; hint: string; txHash: string }
  | { decision: "DUPLICATE"; requestId: number; status: string; txHash: string }
  | { decision: "TX_ERROR"; error: string };

export const decisionSchema = z.object({
  decision: z.string(),
  requestId: z.number().optional(),
});
