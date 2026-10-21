import { getDb } from "./index";

export async function closeDb() {
  const client = (getDb() as unknown as { $client: {
    close?: () => Promise<void>;
    end?: (options?: { timeout?: number }) => Promise<void>;
  } }).$client;
  if (client.close) await client.close();
  else if (client.end) await client.end({ timeout: 1 });
}
