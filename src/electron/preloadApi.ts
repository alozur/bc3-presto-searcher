import { IPC_CHANNELS, type ImportProgress, type PrestoApi } from '../shared/ipc';

type Invoke = (channel: string, ...args: readonly unknown[]) => Promise<unknown>;
type Subscribe = (channel: string, listener: (progress: ImportProgress) => void) => () => void;

export function createPreloadApi(invoke: Invoke, subscribe: Subscribe = () => () => undefined): PrestoApi {
  return {
    importApprovedSource: () => invoke(IPC_CHANNELS.import) as ReturnType<PrestoApi['importApprovedSource']>,
    onImportProgress: (listener) => subscribe(IPC_CHANNELS.importProgress, listener),
    search: (request) => invoke(IPC_CHANNELS.search, request) as ReturnType<PrestoApi['search']>,
    getDetail: (request) => invoke(IPC_CHANNELS.detail, request) as ReturnType<PrestoApi['getDetail']>,
  };
}
