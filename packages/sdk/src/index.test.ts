import { AgentVaultClient, OwnerClient } from "./index";
import { describe, expect, it } from "vitest";

describe("sdk", () => {
  it("constructs clients without network calls", () => {
    const kp = "ed25519:472woHEPihJxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const c = new AgentVaultClient({
      network: "testnet",
      vaultAccountId: "v.testnet",
      agentPrivateKey: kp,
    });
    expect(c.vaultAccountId).toBe("v.testnet");
    const o = new OwnerClient({ network: "testnet", accountId: "o.testnet", privateKey: kp });
    expect(o.account.accountId).toBe("o.testnet");
  });
});
