import type { GetItemDetail, ImportApprovedSource, SearchCatalog } from '../application/useCases';
import { validateDetailRequest, validateSearchRequest } from '../shared/ipc';

export type CatalogIpcDependencies = {
  importSource: Pick<ImportApprovedSource, 'execute'>;
  searchCatalog: Pick<SearchCatalog, 'execute'>;
  getItemDetail: Pick<GetItemDetail, 'execute'>;
};

export function createIpcHandlers(dependencies: CatalogIpcDependencies) {
  return {
    importApprovedSource: async () => dependencies.importSource.execute(),
    search: async (request: unknown) => {
      const { query, limit, offset } = validateSearchRequest(request);
      return dependencies.searchCatalog.execute(query, { limit, offset });
    },
    detail: async (request: unknown) => dependencies.getItemDetail.execute(validateDetailRequest(request)),
  };
}
