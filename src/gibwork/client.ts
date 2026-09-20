import "dotenv/config";
import { createGibworkClient, type GibworkClient } from "@gibwork/sdk/node";

let cachedClient: GibworkClient | null = null;

/**
 * Returns a singleton Gibwork SDK client built from the wallet in env vars.
 * Defaults to STAGE (safe for development). Set GIBWORK_PRODUCTION=true to hit mainnet.
 */
export function getGibworkClient(): GibworkClient {
  if (cachedClient) return cachedClient;

  const privateKey = process.env.SOLANA_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error(
      "SOLANA_PRIVATE_KEY is not set. Copy .env.example to .env and fill it in."
    );
  }

  const production = process.env.GIBWORK_PRODUCTION === "true";

  cachedClient = createGibworkClient({
    privateKey,
    production, // false/undefined -> stage, safe for testing
  });

  return cachedClient;
}
