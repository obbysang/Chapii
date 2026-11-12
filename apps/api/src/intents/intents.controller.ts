import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { OneClickClient } from "./oneclick.client";

const FundQuote = z.object({
  vaultId: z.string().min(3),
  originAsset: z.string(),
  destinationAsset: z.string(),
  amount: z.string().regex(/^\d+$/),
  refundTo: z.string(),
});

@Controller("intents")
export class IntentsController {
  constructor(private readonly oneclick: OneClickClient) {}

  @Post("fund-quote")
  async fundQuote(@Body() body: unknown): Promise<unknown> {
    const b = FundQuote.parse(body);
    const quote = await this.oneclick.quote({
      dry: false,
      swapType: "EXACT_INPUT",
      slippageTolerance: 100,
      originAsset: b.originAsset,
      depositType: "ORIGIN_CHAIN",
      destinationAsset: b.destinationAsset,
      amount: b.amount,
      refundTo: b.refundTo,
      refundType: "ORIGIN_CHAIN",
      recipient: b.vaultId,
      recipientType: "DESTINATION_CHAIN",
      deadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });
    return quote;
  }

  @Get("status")
  async status(@Query("depositAddress") depositAddress: string): Promise<unknown> {
    return this.oneclick.status(depositAddress);
  }

  @Get("tokens")
  async tokens(): Promise<unknown> {
    const all = await this.oneclick.tokens();
    return all.slice(0, 200);
  }
}
