import { useState, useEffect, useRef } from "react";
import * as StellarSdk from "@stellar/stellar-sdk";
import { useNetwork } from "@/app/providers/NetworkProvider";
import {
  type ActivitySource,
  type TokenActivityInfo,
  decodeActivityEvent,
  readEventId,
  readEventLedger,
  readEventTimestamp,
  readEventTopics,
  readEventTxHash,
} from "@/lib/stellar";

interface UseContractEventsOptions {
  intervalMs?: number;
  /**
   * Vesting contract to poll alongside the token, when the token has one.
   * Its events are decoded as vesting events and typed `vesting:*`.
   */
  vestingContractId?: string;
}

interface RpcEvent {
  id?: string;
  pagingToken?: string;
  contractId?: string;
  ledger?: number;
  ledgerClosedAt?: string;
  topic?: string[];
  value?: string;
  txHash?: string;
}

/**
 * Poll a token contract — and optionally the vesting contract holding its
 * tokens — for new events.
 *
 * Both are polled in one subscription so the feed stays a single ordered
 * stream. Each event is decoded against the contract that emitted it, because
 * `init`, `pause`, `unpause`, `prop_adm`, `revoked` and `upgrade` are emitted
 * by both with identical topic tuples.
 */
export function useContractEvents(
  contractId: string,
  options?: UseContractEventsOptions,
) {
  const { networkConfig } = useNetwork();
  const [events, setEvents] = useState<TokenActivityInfo[]>([]);
  const [error, setError] = useState<Error | null>(null);

  const vestingContractId = options?.vestingContractId;
  const startLedgerRef = useRef<number | null>(null);
  const intervalMs = options?.intervalMs ?? 10000;

  useEffect(() => {
    if (!contractId || !networkConfig?.rpcUrl) return;

    /** Which contract an event came from, so the decoder can disambiguate. */
    const sourceOf = (id: string | undefined): ActivitySource =>
      vestingContractId && id === vestingContractId ? "vesting" : "token";

    const watchedIds = vestingContractId
      ? [contractId, vestingContractId]
      : [contractId];

    const rpc = new StellarSdk.rpc.Server(networkConfig.rpcUrl);
    const getEvents = (
      rpc as unknown as {
        getEvents?: (req: unknown) => Promise<{ events?: RpcEvent[] }>;
      }
    ).getEvents;

    if (!getEvents) {
      console.warn("getEvents is not available on this RPC server instance");
      return;
    }

    let isMounted = true;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let isPolling = false;

    const safeGetEvents = async (startLedger: number) => {
      try {
        const response = await getEvents.call(rpc, {
          startLedger,
          filters: [{ type: "contract", contractIds: watchedIds }],
          pagination: { limit: 100 },
        });
        return response?.events ?? [];
      } catch (err) {
        console.error("Error polling getEvents:", err);
        return [];
      }
    };

    const poll = async () => {
      if (!isMounted || isPolling) return;
      isPolling = true;

      try {
        if (startLedgerRef.current === null) {
          const { sequence } = await rpc.getLatestLedger();
          startLedgerRef.current = sequence;
        }

        const rawEvents = await safeGetEvents(startLedgerRef.current);

        if (!isMounted) return;

        const newRecords: TokenActivityInfo[] = [];
        let maxLedgerSeen = startLedgerRef.current;

        for (const evt of rawEvents) {
          const evtLedger = readEventLedger(evt) || startLedgerRef.current;
          if (evtLedger > maxLedgerSeen) maxLedgerSeen = evtLedger;

          const topics = readEventTopics(evt);
          if (topics.length === 0) continue;

          const rawValue =
            (evt as { value?: unknown; data?: unknown }).value ??
            (evt as { data?: unknown }).data;

          // One decoder, shared with lib/stellar.ts. The duplicate switch that
          // used to live here is how the two drifted apart in the first place.
          const record = decodeActivityEvent(
            topics,
            rawValue as string | undefined,
            {
              id: readEventId(evt, `${readEventTxHash(evt)}-${evtLedger}`),
              txHash: readEventTxHash(evt),
              ledger: evtLedger,
              timestamp: readEventTimestamp(evt),
            },
            sourceOf(evt.contractId),
          );
          if (!record) continue;

          record.pagingToken = evt.pagingToken ?? "";

          newRecords.push(record);
        }

        if (maxLedgerSeen >= startLedgerRef.current) {
          startLedgerRef.current = maxLedgerSeen + 1;
        }

        if (newRecords.length > 0) {
          setEvents((prev: TokenActivityInfo[]) => {
            const addedIds = new Set(prev.map((p: TokenActivityInfo) => p.id));
            const uniqueNew = newRecords.filter(
              (r: TokenActivityInfo) => !addedIds.has(r.id),
            );
            if (uniqueNew.length === 0) return prev;
            return [...uniqueNew.reverse(), ...prev];
          });
        }

        setError(null);
      } catch (err) {
        if (isMounted)
          setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        isPolling = false;
      }
    };

    poll();
    timerId = setInterval(poll, intervalMs);

    return () => {
      isMounted = false;
      if (timerId) clearInterval(timerId);
    };
  }, [contractId, vestingContractId, networkConfig, intervalMs]);

  return { events, error };
}
