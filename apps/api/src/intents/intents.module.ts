import { Module } from "@nestjs/common";
import { IntentsController } from "./intents.controller";
import { OneClickClient } from "./oneclick.client";

@Module({ providers: [OneClickClient], controllers: [IntentsController], exports: [OneClickClient] })
export class IntentsModule {}
