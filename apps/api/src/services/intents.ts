import type { AppConfig } from '../config.js';
import { AppError } from '../lib/errors.js';

export interface IntentsQuoteResult {
  depositAddress: string;
  depositMemo: string | null;
  originAsset: string;
  destinationAsset: string;
  amountIn: string;
  amountOut: string;
  deadline: string;
  timeEstimate: number;
  provider: string;
  quote: unknown;
}

interface OneClickQuoteResponse {
  quote?: {
    depositAddress?: string;
    depositMemo?: string;
    amountOut?: string;
    deadline?: string;
    timeEstimate?: number;
  };
  depositAddress?: string;
  amountOut?: string;
  deadline?: string;
  timeEstimate?: number;
}

/**
 * Thin server-side proxy for the NEAR Intents 1-Click API. The JWT is optional
 * (the API charges a small fee without one) and never reaches the browser.
 * Intents is mainnet-only; the UI labels it accordingly.
 */
export class IntentsService {
  private tokenCache?: { at: number; tokens: unknown };

  constructor(private readonly config: AppConfig) {}

  get enabled(): boolean {
    return Boolean(this.config.oneClickApiUrl);
  }

  private ensureEnabled(): string {
    if (!this.config.oneClickApiUrl) {
      throw new AppError(
        'INTENTS_NOT_CONFIGURED',
        'NEAR Intents requires ONECLICK_API_URL (mainnet only). Set it in the API environment.',
        503,
      );
    }
    return this.config.oneClickApiUrl;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.config.oneClickJwt) headers.authorization = `Bearer ${this.config.oneClickJwt}`;
    return headers;
  }

  async quote(input: {
    vaultId: string;
    originAsset: string;
    destinationAsset: string;
    amount: string;
    refundTo?: string;
    recipient?: string;
  }): Promise<IntentsQuoteResult> {
    const base = this.ensureEnabled();
    const body = {
      dry: false,
      swapType: 'EXACT_INPUT',
      originAsset: input.originAsset,
      destinationAsset: input.destinationAsset,
      amount: input.amount,
      recipient: input.recipient ?? input.vaultId,
      recipientType: 'DESTINATION_CHAIN',
      refundTo: input.refundTo ?? input.vaultId,
      refundType: 'ORIGIN_CHAIN',
      deadline: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
      slippageTolerance: 100,
    };
    const response = await fetch(`${base}/v0/quote`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new AppError(
        'INTENTS_QUOTE_FAILED',
        `1-Click quote failed (${response.status}): ${text.slice(0, 300)}`,
        502,
      );
    }
    const json = (await response.json()) as OneClickQuoteResponse;
    const quote = json.quote ?? {};
    const depositAddress = quote.depositAddress ?? json.depositAddress;
    if (!depositAddress) {
      throw new AppError('INTENTS_QUOTE_FAILED', '1-Click returned no deposit address', 502);
    }
    return {
      depositAddress,
      depositMemo: quote.depositMemo ?? null,
      originAsset: input.originAsset,
      destinationAsset: input.destinationAsset,
      amountIn: input.amount,
      amountOut: quote.amountOut ?? json.amountOut ?? '0',
      deadline: quote.deadline ?? json.deadline ?? body.deadline,
      timeEstimate: quote.timeEstimate ?? json.timeEstimate ?? 0,
      provider: 'NEAR Intents 1-Click',
      quote: json,
    };
  }

  async status(depositAddress: string): Promise<unknown> {
    const base = this.ensureEnabled();
    const response = await fetch(
      `${base}/v0/status?depositAddress=${encodeURIComponent(depositAddress)}`,
      { headers: this.headers(), signal: AbortSignal.timeout(15_000) },
    );
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new AppError(
        'INTENTS_STATUS_FAILED',
        `1-Click status failed (${response.status}): ${text.slice(0, 300)}`,
        502,
      );
    }
    return response.json();
  }

  async tokens(): Promise<unknown> {
    if (this.tokenCache && Date.now() - this.tokenCache.at < 5 * 60_000) {
      return this.tokenCache.tokens;
    }
    const base = this.ensureEnabled();
    const response = await fetch(`${base}/v0/tokens`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new AppError('INTENTS_TOKENS_FAILED', `1-Click tokens failed (${response.status})`, 502);
    }
    const tokens = await response.json();
    this.tokenCache = { at: Date.now(), tokens };
    return tokens;
  }
}
