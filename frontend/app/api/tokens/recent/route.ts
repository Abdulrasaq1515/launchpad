import { NextResponse } from "next/server";
import { NETWORKS, type NetworkType } from "@/types/network";
import { fetchRecentTokens, type FetchRecentTokensResult } from "@/lib/recentTokens";

// NOTE: Any Mercury indexer integration in this route must use the server-only
// MERCURY_AUTH_TOKEN environment variable (no NEXT_PUBLIC_ prefix). This route
// runs exclusively on the server — it is the correct place to hold that
// credential and proxy results to the client. Never pass the token to the
// client or read it from a NEXT_PUBLIC_ variable.

interface CacheEntry {
  data: FetchRecentTokensResult;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const network = (searchParams.get("network") ?? "testnet") as NetworkType;
  const cursor = searchParams.get("cursor") ?? undefined;
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 12;

  if (network !== "testnet" && network !== "mainnet") {
    return NextResponse.json(
      { error: "Invalid network parameter." },
      { status: 400 },
    );
  }

  // Issue #477: Cache key includes cursor to support pagination
  const cacheKey = `${network}-${cursor || 'initial'}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data);
  }

  try {
    const config = NETWORKS[network];
    const factoryAddress = process.env.NEXT_PUBLIC_FACTORY_ADDRESS ?? "";
    const result = await fetchRecentTokens(config, factoryAddress, { cursor, limit });

    cache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch recent tokens:", error);

    // If Mercury is not configured, return empty result with informational header
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      errorMessage.includes("getEvents") ||
      errorMessage.includes("Mercury") ||
      errorMessage.includes("MERCURY_AUTH_TOKEN")
    ) {
      const headers = new Headers();
      headers.set("X-Note", "Mercury indexer not configured");
      return NextResponse.json({ tokens: [], nextCursor: null }, { headers });
    }

    return NextResponse.json(
      { error: "Failed to fetch recent tokens." },
      { status: 500 },
    );
  }
}
