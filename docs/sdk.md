# TypeScript SDK

`packages/sdk` is a thin, typed client for the AgentVault contract and the
Fastify API. It is what the MCP server and the demo agent use internally, and it
is the recommended integration point for a custom agent loop.

```ts
import { AgentVaultClient } from '@agentvault/sdk';

const vault = new AgentVaultClient({
  network: 'testnet',
  vaultAccountId: process.env.VAULT_ACCOUNT_ID!,
  agentPrivateKey: process.env.AGENT_PRIVATE_KEY!, // the agent's own key
});

const result = await vault.requestPayment({
  client_ref: crypto.randomUUID(),
  asset: 'NEAR',
  amount: '1500000000000000000000000', // raw yoctoNEAR = 1.5 NEAR
  chain: 'near',
  address: 'merchant.testnet',
  memo: 'API usage',
});
```

## What the client does

- Signs `request_payment` with the agent's ed25519 function-call key.
- Sends a raw integer amount; it never converts through a float.
- Returns the contract's decision plus a normalised `reason` and `hint`.
- Exposes `getBudget`, `getPolicy`, `getRequest`, and `listRecentRequests`
  wrappers over the contract view methods.

## What it cannot do

The key it holds is a NEAR function-call access key restricted to
`request_payment`. It cannot call `withdraw_near`, `approve_request`,
`add_agent`, `freeze_agent`, or any other owner method. That restriction is
enforced by the NEAR protocol, not by the SDK.

## Amounts and assets

| Asset | Decimals | Example raw value |
|---|---|---|
| `NEAR` | 24 | `1.5 NEAR` → `1500000000000000000000000` |
| `ft:usdc.testnet` | 6 | `2.5 USDC` → `2500000` |

Use the helpers in `@agentvault/shared` to convert without floating point loss:

```ts
import { parseUnits, formatUnits, assetDecimals } from '@agentvault/shared';

const raw = parseUnits('1.5', assetDecimals('NEAR')).toString();
const human = formatUnits(raw, assetDecimals('NEAR')); // "1.5"
```

## Error handling

`requestPayment` resolves with a decision rather than throwing for policy
rejections. Throwing is reserved for transport and signing failures, which map
to `TX_ERROR`. See [api.md](api.md) for the full decision and reason tables.

## Building

```bash
pnpm --filter @agentvault/sdk build
pnpm --filter @agentvault/sdk test
```
