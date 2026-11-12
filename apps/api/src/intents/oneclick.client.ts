import { Injectable } from "@nestjs/common";

const BASE = (): string => process.env.ONECLICK_API_URL ?? "https://1click.chaindefuser.com";

function jwt(): Record<string, string> {
  const t = process.env.ONECLICK_JWT;
  return t ? { "X-API-Key": t } : {};
}

export interface QuoteRequest {
  dry: boolean;
  swapType: "EXACT_INPUT" | "EXACT_OUTPUT";
  slippageTolerance: number;
  originAsset: string;
  depositType: string;
  destinationAsset: string;
  amount: string;
  refundTo: string;
  refundType: string;
  recipient: string;
  recipientType: string;
  deadline: string;
}

@Injectable()
export class OneClickClient {
  async quote(q: QuoteRequest): Promise<Record<string, unknown>> {
    const res = await fetch(`${BASE()}/v0/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...jwt() },
      body: JSON.stringify(q),
    });
    if (!res.ok) throw new Error(`1click quote ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  }

  async status(depositAddress: string, depositMemo?: string): Promise<{ status: string }> {
    const qs = new URLSearchParams({ depositAddress });
    if (depositMemo) qs.set("depositMemo", depositMemo);
    const res = await fetch(`${BASE()}/v0/status?${qs.toString()}`, { headers: { ...jwt() } });
    if (!res.ok) throw new Error(`1click status ${res.status}`);
    return (await res.json()) as { status: string };
  }

  async tokens(): Promise<Array<Record<string, unknown>>> {
    const res = await fetch(`${BASE()}/v0/tokens`, { headers: { ...jwt() } });
    if (!res.ok) throw new Error(`1click tokens ${res.status}`);
    return (await res.json()) as Array<Record<string, unknown>>;
  }

  async submitDeposit(depositAddress: string, txHash: string): Promise<void> {
    await fetch(`${BASE()}/v0/deposit/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...jwt() },
      body: JSON.stringify({ depositAddress, txHash }),
    });
  }
}
