import { REASON_MESSAGES, paymentArgsSchema } from "./index";
import { describe, expect, it } from "vitest";

describe("shared", () => {
  it("maps every reason to message+hint", () => {
    expect(REASON_MESSAGES.PAYEE_NOT_ALLOWED.hint).toContain("Do not retry");
    expect(REASON_MESSAGES.RATE_LIMIT_EXCEEDED.hint).toContain("Back off");
  });
  it("validates payment args", () => {
    const ok = paymentArgsSchema.safeParse({
      client_ref: "abc-1",
      asset: "NEAR",
      amount: "100",
      chain: "near",
      address: "alice.testnet",
    });
    expect(ok.success).toBe(true);
    const bad = paymentArgsSchema.safeParse({
      client_ref: "bad ref!",
      asset: "NEAR",
      amount: "x",
      chain: "near",
      address: "alice.testnet",
    });
    expect(bad.success).toBe(false);
  });
});
