import { KeyPair, KeyPairString } from 'near-api-js';

export interface GeneratedAgentKey {
  publicKey: string;
  privateKey: string;
}

/** Generate an ed25519 keypair locally. The private key never leaves the caller. */
export function generateAgentKey(): GeneratedAgentKey {
  const pair = KeyPair.fromRandom('ed25519');
  return {
    publicKey: pair.getPublicKey().toString(),
    privateKey: pair.toString(),
  };
}

export function publicKeyOf(privateKey: string): string {
  return KeyPair.fromString(privateKey as KeyPairString).getPublicKey().toString();
}

export function isValidPrivateKey(key: string): boolean {
  try {
    KeyPair.fromString(key as KeyPairString);
    return true;
  } catch {
    return false;
  }
}
