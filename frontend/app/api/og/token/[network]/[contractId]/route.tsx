import { ImageResponse } from "next/og";
import { fetchTokenInfo } from "@/lib/stellar";
import { isValidContractId } from "@/lib/contractValidation";
import { NETWORKS, type NetworkType } from "@/types/network";

export const runtime = "edge";

// Cache lifetime for OG images — 60 s fresh, then serve stale while revalidating
// for up to an additional 60 s.  Mirrors the /api/tokens/recent TTL precedent.
const CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=60";

function resolveNetwork(network: string): NetworkType {
  return network === "mainnet" ? "mainnet" : "testnet";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ network: string; contractId: string }> }
) {
  const { network, contractId } = await params;

  // Reject malformed contract IDs immediately — no RPC call needed.
  if (!isValidContractId(contractId)) {
    return new Response("Invalid contract ID", { status: 400 });
  }

  try {
    const resolvedNetwork = resolveNetwork(network);
    const tokenInfo = await fetchTokenInfo(contractId, NETWORKS[resolvedNetwork]);

    return new ImageResponse(
      (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            backgroundColor: "#ffffff",
            color: "#14161a",
            fontFamily: "system-ui, sans-serif",
            padding: "64px",
            borderTop: "10px solid #f0b429",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                width: "72px",
                height: "72px",
                borderRadius: "14px",
                border: "2px solid #e3e6ea",
                backgroundColor: "#f4f5f7",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "28px",
                fontSize: "26px",
                fontWeight: 600,
                color: "#33383f",
              }}
            >
              {tokenInfo.symbol.slice(0, 2).toUpperCase()}
            </div>

            {/* Token Name and Symbol */}
            <h1
              style={{
                fontSize: "60px",
                fontWeight: 600,
                letterSpacing: "-0.02em",
                margin: "0 0 6px 0",
                color: "#14161a",
              }}
            >
              {tokenInfo.name}
            </h1>

            <p
              style={{
                fontSize: "30px",
                margin: "0 0 36px 0",
                color: "#6b727c",
              }}
            >
              ({tokenInfo.symbol})
            </p>

            {/* Token Details */}
            <div
              style={{ display: "flex", gap: "56px", fontSize: "22px" }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ color: "#6b727c", fontSize: "18px" }}>Total supply</span>
                <span style={{ color: "#14161a", fontWeight: 500 }}>{tokenInfo.totalSupply}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ color: "#6b727c", fontSize: "18px" }}>Decimals</span>
                <span style={{ color: "#14161a", fontWeight: 500 }}>{tokenInfo.decimals}</span>
              </div>
            </div>


          </div>
            {/* Footer */}
            <div
              style={{
                fontSize: "18px",
                color: "#6b727c",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <div
                style={{
                  width: "16px",
                  height: "16px",
                  borderRadius: "4px",
                  backgroundColor: "#f0b429",
                }}
              />
              SoroPad — token issuance on Stellar
            </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        headers: { "Cache-Control": CACHE_CONTROL },
      }
    );
  } catch (error) {
    console.error("Error generating OG image:", error);

    // Fallback image — also cached so a single bad/transient fetch
    // does not hammer the RPC endpoint on every retry.
    return new ImageResponse(
      (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#ffffff",
            color: "#14161a",
            fontFamily: "system-ui, sans-serif",
            borderTop: "10px solid #f0b429",
          }}
        >
          <h1
            style={{
              fontSize: "48px",
              fontWeight: "bold",
              margin: "0 0 16px 0",
            }}
          >
            Token Details
          </h1>
          <p
            style={{
              fontSize: "24px",
              margin: "0",
              color: "#9ca3af",
            }}
          >
            View on SoroPad
          </p>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        headers: { "Cache-Control": CACHE_CONTROL },
      }
    );
  }
}
