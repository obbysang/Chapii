-- CreateEnum
CREATE TYPE "Network" AS ENUM ('testnet', 'mainnet');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('ACTIVE', 'FROZEN', 'REVOKED');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('REJECTED', 'PENDING_APPROVAL', 'APPROVED', 'AWAITING_EXECUTION', 'EXECUTING', 'COMPLETED', 'FAILED', 'REJECTED_BY_OWNER', 'EXPIRED');

-- CreateEnum
CREATE TYPE "JobState" AS ENUM ('QUEUED', 'QUOTING', 'QUOTED', 'FUNDING', 'FUNDED', 'POLLING', 'DELIVERED', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "Verification" AS ENUM ('UNVERIFIED', 'OK', 'MISMATCH');

-- CreateEnum
CREATE TYPE "HarnessStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'ERROR');

-- CreateTable
CREATE TABLE "Vault" (
    "id" TEXT NOT NULL,
    "network" "Network" NOT NULL,
    "ownerAccountId" TEXT NOT NULL,
    "label" TEXT,
    "cursorSeq" BIGINT NOT NULL DEFAULT 0,
    "health" TEXT NOT NULL DEFAULT 'ok',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "vaultId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL,
    "policyJson" JSONB NOT NULL,
    "violations" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRequest" (
    "id" TEXT NOT NULL,
    "vaultId" TEXT NOT NULL,
    "onchainId" BIGINT NOT NULL,
    "agentPublicKey" TEXT NOT NULL,
    "agentId" TEXT,
    "clientRef" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "amount" DECIMAL(40,0) NOT NULL,
    "chain" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "destAsset" TEXT,
    "memo" TEXT,
    "status" "RequestStatus" NOT NULL,
    "reason" TEXT,
    "depositAddress" TEXT,
    "settlementRef" TEXT,
    "lastChangeSeq" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "indexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrosschainJob" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "state" "JobState" NOT NULL DEFAULT 'QUEUED',
    "quoteJson" JSONB,
    "depositAddress" TEXT,
    "fundTxHash" TEXT,
    "statusJson" JSONB,
    "verification" "Verification" NOT NULL DEFAULT 'UNVERIFIED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrosschainJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChainEvent" (
    "id" TEXT NOT NULL,
    "vaultId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dataJson" JSONB NOT NULL,
    "txHash" TEXT,
    "receiptId" TEXT,
    "blockHeight" BIGINT,
    "ts" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChainEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HarnessRun" (
    "id" TEXT NOT NULL,
    "vaultId" TEXT NOT NULL,
    "status" "HarnessStatus" NOT NULL DEFAULT 'QUEUED',
    "total" INTEGER NOT NULL DEFAULT 0,
    "passed" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "summaryJson" JSONB,
    "requesterIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HarnessRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HarnessResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "expected" TEXT NOT NULL,
    "actual" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "txHash" TEXT,
    "invariantsOk" BOOLEAN NOT NULL,
    "notes" TEXT,
    "durationMs" INTEGER NOT NULL,

    CONSTRAINT "HarnessResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "vaultId" TEXT,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthChallenge" (
    "nonce" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthChallenge_pkey" PRIMARY KEY ("nonce")
);

-- CreateIndex
CREATE INDEX "Vault_ownerAccountId_idx" ON "Vault"("ownerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_vaultId_publicKey_key" ON "Agent"("vaultId", "publicKey");

-- CreateIndex
CREATE INDEX "PaymentRequest_vaultId_status_idx" ON "PaymentRequest"("vaultId", "status");

-- CreateIndex
CREATE INDEX "PaymentRequest_vaultId_createdAt_idx" ON "PaymentRequest"("vaultId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentRequest_vaultId_agentPublicKey_idx" ON "PaymentRequest"("vaultId", "agentPublicKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRequest_vaultId_onchainId_key" ON "PaymentRequest"("vaultId", "onchainId");

-- CreateIndex
CREATE UNIQUE INDEX "CrosschainJob_requestId_key" ON "CrosschainJob"("requestId");

-- CreateIndex
CREATE INDEX "CrosschainJob_state_nextRunAt_idx" ON "CrosschainJob"("state", "nextRunAt");

-- CreateIndex
CREATE INDEX "ChainEvent_vaultId_ts_idx" ON "ChainEvent"("vaultId", "ts");

-- CreateIndex
CREATE INDEX "HarnessResult_runId_idx" ON "HarnessResult"("runId");

-- CreateIndex
CREATE INDEX "Notification_accountId_readAt_idx" ON "Notification"("accountId", "readAt");

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "Vault"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "Vault"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrosschainJob" ADD CONSTRAINT "CrosschainJob_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PaymentRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChainEvent" ADD CONSTRAINT "ChainEvent_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "Vault"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarnessRun" ADD CONSTRAINT "HarnessRun_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "Vault"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarnessResult" ADD CONSTRAINT "HarnessResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "HarnessRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
