// near-api-js and @near-wallet-selector rely on Node globals (Buffer, global,
// process). Vite does not polyfill these, so install the minimum set before
// any wallet module is evaluated.
import { Buffer } from 'buffer';

const globals = globalThis as typeof globalThis & {
  Buffer?: typeof Buffer;
  global?: typeof globalThis;
  process?: { env: Record<string, string | undefined> };
};

globals.Buffer = globals.Buffer ?? Buffer;
globals.global = globals.global ?? globalThis;
globals.process = globals.process ?? { env: {} };
