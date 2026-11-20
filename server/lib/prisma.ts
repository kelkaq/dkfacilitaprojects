import { PrismaClient } from '@prisma/client';

let client: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL não configurada para a API CSDK.');
  }
  client ??= new PrismaClient();
  return client;
}
