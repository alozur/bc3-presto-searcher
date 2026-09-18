import { GetItemDetail, ImportApprovedSource, SearchCatalog } from '../application/useCases';
import type { ClockPort, SourceFilePort } from '../application/ports';
import { SqliteCatalogRepository } from '../infrastructure/sqlite/repository';
import { createIpcHandlers } from './ipcHandlers';

export type CatalogServicesOptions = {
  databasePath: string;
  files: SourceFilePort;
  clock?: ClockPort;
};

export function createCatalogServices({ databasePath, files, clock = { nowIso: () => new Date().toISOString() } }: CatalogServicesOptions) {
  const repository = SqliteCatalogRepository.open(databasePath);
  return {
    handlers: createIpcHandlers({
      importSource: new ImportApprovedSource(files, repository, clock),
      searchCatalog: new SearchCatalog(repository),
      getItemDetail: new GetItemDetail(repository),
    }),
  };
}
