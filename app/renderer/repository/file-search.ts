import { useCallback, useEffect, useRef, useState } from "react";
import { PROTOCOL_VERSION } from "../../../protocol/common";
import { FileSearchQuerySchema, parseRepositorySearchResult, type RepositorySearchRequest, type RepositorySearchResult } from "../../../protocol/repository-search";
import type { CoreResponse } from "../../../protocol/schema";

interface SearchState { key: string; loading: boolean; result?: RepositorySearchResult; error?: string }
export function useFileSearch(repositoryId: string | undefined, query: string, enabled: boolean, generation: number,
  request: (input: RepositorySearchRequest) => Promise<CoreResponse | null>) {
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [state, setState] = useState<SearchState>({ key: "", loading: false });
  const refreshConsumed = useRef(0);
  const serial = useRef(0);
  const active = enabled && Boolean(repositoryId) && query.length > 0;
  const key = JSON.stringify([repositoryId, query, active, generation, refreshVersion]);
  useEffect(() => {
    const current = ++serial.current;
    if (!active || !repositoryId) { setState({ key, loading: false }); return; }
    if (!FileSearchQuerySchema.safeParse(query).success) { setState({ key, loading: false, error: "Use a literal filename fragment of at most 256 characters, without control characters." }); return; }
    setState({ key, loading: true });
    const timer = setTimeout(() => {
      const refresh = refreshVersion !== refreshConsumed.current;
      refreshConsumed.current = refreshVersion;
      const input: RepositorySearchRequest = { protocolVersion: PROTOCOL_VERSION, requestId: `file-search:${crypto.randomUUID()}`,
        type: "repo.search", repositoryId, query, refresh };
      void request(input).then((response) => {
        if (current !== serial.current) return;
        if (!response?.ok) throw new Error(response && !response.ok ? response.error.message : "Filename search is unavailable while the local core recovers.");
        setState({ key, loading: false, result: parseRepositorySearchResult(response.search, input) });
      }).catch((error: unknown) => {
        if (current === serial.current) setState({ key, loading: false, error: error instanceof Error ? error.message : "Filename search is unavailable." });
      });
    }, 120);
    return () => { ++serial.current; clearTimeout(timer); };
  }, [key, active, repositoryId, query, generation, refreshVersion, request]);
  const refresh = useCallback(() => setRefreshVersion((value) => value + 1), []);
  // Do not expose an old result even for the render before effect cleanup runs.
  return { ...(state.key === key ? state : { key, loading: active }), refresh };
}
