import { useCallback, useEffect, useRef, useState } from "react";
import type { CoreResponse } from "../../../protocol/schema";
import { PROTOCOL_VERSION } from "../../../protocol/common";
import { isRepositoryPath, parseRepositoryResultForRequest, type RepositoryObservation, type RepositoryRequest } from "../../../protocol/repository";

export interface DirectoryLocation { directory: string; page: number; filter: string }
export interface RepositoryCameraIntent { directory: string; page: number; restore: boolean; serial: number }
interface Intent extends DirectoryLocation { refresh: boolean; revealPath?: string; backIndex?: number; expand?: boolean }
export const DIRECTORY_HISTORY_LIMIT = 32;
export const directoryCameraKey = (location: Pick<DirectoryLocation, "directory" | "page">) => JSON.stringify([location.directory, location.page]);
export const parentDirectory = (path: string) => path.split("/").slice(0, -1).join("/");
export function repositoryBreadcrumbs(directory: string): Array<{ label: string; path: string }> {
  return [{ label: "/", path: "" }, ...(directory ? directory.split("/").map((label, index, parts) => ({ label, path: parts.slice(0, index + 1).join("/") })) : [])];
}

/** Only sequenced workspace events publish observations. Acknowledgements drive
 * local notices/history, never a second snapshot replacement. */
export function useRepositoryNavigation(observation: RepositoryObservation | undefined, generation: number, available: boolean,
  request: (input: RepositoryRequest) => Promise<CoreResponse | null>) {
  const current = useRef({ observation, generation, available, request });
  current.current = { observation, generation, available, request };
  const intentSerial = useRef(0);
  const history = useRef<DirectoryLocation[]>([]);
  const failed = useRef<Intent | null>(null);
  const [pendingSerial, setPendingSerial] = useState<number | null>(null);
  const pending = pendingSerial !== null;
  const [notice, setNotice] = useState("");
  const [historySize, setHistorySize] = useState(0);
  const [cameraIntent, setCameraIntent] = useState<RepositoryCameraIntent | null>(null);
  const [expansionIntent, setExpansionIntent] = useState<{ directory: string; serial: number } | null>(null);

  useEffect(() => {
    ++intentSerial.current;
    setPendingSerial(null);
    failed.current = null;
    setCameraIntent(null);
    setExpansionIntent(null);
    setNotice("");
    return () => { ++intentSerial.current; };
  }, [generation]);

  const navigate = useCallback(async (intent: Intent): Promise<boolean> => {
    const before = current.current;
    if (!before.available || !before.observation) { setNotice("Repository navigation is unavailable until the local core is ready."); return false; }
    if (!isRepositoryPath(intent.directory, true)) { setNotice("Use a canonical repository-relative directory, without .git or parent segments."); return false; }
    const serial = ++intentSerial.current;
    const prior = before.observation;
    const input: RepositoryRequest = {
      protocolVersion: PROTOCOL_VERSION, requestId: `repository:${crypto.randomUUID()}`, type: "repo.list",
      directory: intent.directory, page: intent.page, filter: intent.filter, refresh: intent.refresh,
      ...(!intent.refresh && prior.directory === intent.directory ? { observationId: prior.observationId } : {}),
      ...(intent.revealPath ? { revealPath: intent.revealPath } : {}),
    };
    setPendingSerial(serial); setNotice(""); failed.current = null;
    setCameraIntent(null);
    try {
      const response = await before.request(input);
      if (serial !== intentSerial.current || before.generation !== current.current.generation) return false;
      if (!response?.ok || !response.repo) throw new Error(response && !response.ok ? response.error.message : "Local-core directory observation was interrupted.");
      const result = parseRepositoryResultForRequest(response.repo, input).observation;
      if (intent.expand) setExpansionIntent({ directory: result.directory, serial });
      if (prior.directory !== result.directory || prior.page !== result.page || intent.backIndex !== undefined)
        setCameraIntent({ directory: result.directory, page: result.page, restore: intent.backIndex !== undefined, serial });
      if (intent.backIndex !== undefined) history.current = history.current.slice(0, intent.backIndex);
      else if (prior.directory !== result.directory || prior.page !== result.page) {
        history.current = [...history.current, { directory: prior.directory, page: prior.page, filter: prior.filter }].slice(-DIRECTORY_HISTORY_LIMIT);
      }
      setHistorySize(history.current.length);
      return true;
    } catch (error) {
      if (serial !== intentSerial.current || before.generation !== current.current.generation) return false;
      failed.current = intent;
      setNotice(`Could not open ${intent.directory || "/"}: ${error instanceof Error ? error.message : "directory unavailable"}. Previous directory retained.`);
      return false;
    } finally {
      if (serial === intentSerial.current && before.generation === current.current.generation) setPendingSerial(null);
    }
  }, []);

  const enter = useCallback((directory: string) => navigate({ directory, page: 0, filter: "", refresh: true, expand: true }), [navigate]);
  const up = useCallback(() => enter(parentDirectory(current.current.observation?.directory ?? "")), [enter]);
  const back = useCallback(() => {
    const index = history.current.length - 1, target = history.current[index];
    return target ? navigate({ ...target, refresh: true, backIndex: index, expand: true }) : Promise.resolve(false);
  }, [navigate]);
  const refresh = useCallback(() => {
    const observed = current.current.observation;
    return observed ? navigate({ directory: observed.directory, page: observed.page, filter: observed.filter, refresh: true }) : Promise.resolve(false);
  }, [navigate]);
  const page = useCallback((page: number) => {
    const observed = current.current.observation;
    return observed ? navigate({ directory: observed.directory, page, filter: observed.filter, refresh: false }) : Promise.resolve(false);
  }, [navigate]);
  const filter = useCallback((filter: string) => {
    const observed = current.current.observation;
    return observed ? navigate({ directory: observed.directory, page: 0, filter: filter.slice(0, 256), refresh: false }) : Promise.resolve(false);
  }, [navigate]);
  const reveal = useCallback((path: string) => {
    if (!isRepositoryPath(path)) { setNotice("Use an exact canonical repository-relative file path, without .git or parent segments."); return Promise.resolve(false); }
    const directory = parentDirectory(path);
    return navigate({ directory, page: 0, filter: "", refresh: current.current.observation?.directory !== directory, revealPath: path, expand: true });
  }, [navigate]);
  const retry = useCallback(() => failed.current ? navigate({ ...failed.current, refresh: true }) : Promise.resolve(false), [navigate]);
  return { pending, pendingSerial, notice, cameraIntent, expansionIntent, backEnabled: historySize > 0, retryEnabled: Boolean(failed.current), enter, up, back, refresh, page, filter, reveal, retry };
}
export type RepositoryNavigationActions = ReturnType<typeof useRepositoryNavigation>;
