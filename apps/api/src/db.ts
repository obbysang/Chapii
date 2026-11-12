import { PrismaClient } from '@prisma/client';

export type Db = PrismaClient;

let client: PrismaClient | undefined;

export function getDb(): PrismaClient {
  if (!client) {
    client = new PrismaClient({
      log: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['error', 'warn'],
    });
  }
  return client;
}

export async function disconnectDb(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}
