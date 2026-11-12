import { describe, expect, it } from 'vitest';
import { generateAgentKey, publicKeyOf } from './keygen.js';

describe('agent key generation', () => {
  it('derives the public key from the generated private key', () => {
    const key = generateAgentKey();
    expect(key.publicKey).toMatch(/^ed25519:/);
    expect(key.privateKey).toMatch(/^ed25519:/);
    expect(publicKeyOf(key.privateKey)).toBe(key.publicKey);
  });

  it('generates distinct keys', () => {
    expect(generateAgentKey().publicKey).not.toBe(generateAgentKey().publicKey);
  });
});
