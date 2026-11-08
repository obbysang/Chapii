import { Injectable } from "@nestjs/common";
import { JsonRpcProvider } from "@near-js/providers";

@Injectable()
export class ChainClient {
  provider: JsonRpcProvider;

  constructor() {
    const rpc = process.env.NEAR_RPC_URL ?? "https://rpc.testnet.fastnear.com";
    this.provider = new JsonRpcProvider({ url: rpc });
  }

  async view(vault: string, method: string, args?: unknown): Promise<unknown> {
    return this.provider.callFunction(vault, method, (args ?? {}) as Record<string, unknown>);
  }
}
