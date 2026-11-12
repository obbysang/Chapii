// Polyfill Node globals required by wallet-selector deps. Imported first from main.tsx
// so its module body runs before the wallet-selector modules initialize.
import { Buffer } from "buffer";

const g = globalThis as unknown as Record<string, unknown>;
g.global = globalThis;
g.Buffer = Buffer;
g.process = { env: { NODE_ENV: "development" } };
