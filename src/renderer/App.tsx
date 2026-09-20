import { useEffect, useState } from 'react';
import type { ItemDetail, SearchResponse } from '../domain/catalog';
import type { ImportProgress, ImportResponse, PrestoApi } from '../shared/ipc';

type RendererWindow = Window & typeof globalThis & { presto?: PrestoApi };

function imported(response: ImportResponse): response is Exclude<ImportResponse, { status: 'cancelled' }> {
  return !('status' in response);
}

function progressMessage(progress: ImportProgress | null) {
  if (progress?.phase === 'parsing') return 'Analizando el catálogo BC3.';
  if (progress?.phase === 'storing') return 'Guardando el catálogo para buscarlo.';
  return 'Esperando la selección del archivo BC3.';
}

export function App() {
  const [query, setQuery] = useState('');
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [importing, setImporting] = useState(false);
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const api = (window as RendererWindow).presto;

  useEffect(() => api?.onImportProgress(setImportProgress), [api]);

  async function importCatalog() {
    if (!api) return setMessage('La aplicación de escritorio no está disponible.');
    setMessage(null);
    setDetail(null);
    setImportResult(null);
    setImportProgress(null);
    setImporting(true);
    try {
      setImportResult(await api.importApprovedSource());
    } catch {
      setMessage('No se pudo importar el catálogo seleccionado.');
    } finally {
      setImporting(false);
    }
  }

  async function search() {
    const trimmed = query.trim();
    setDetail(null);
    if (!trimmed) {
      setSearchResult({ status: 'empty-query' });
      return;
    }
    if (!api) return setMessage('La aplicación de escritorio no está disponible.');
    setMessage(null);
    try {
      setSearchResult(await api.search({ query: trimmed }));
    } catch {
      setMessage('No se pudo realizar la búsqueda.');
    }
  }

  async function openDetail(source: Parameters<PrestoApi['getDetail']>[0]) {
    if (!api) return setMessage('La aplicación de escritorio no está disponible.');
    setMessage(null);
    try {
      const result = await api.getDetail(source);
      setDetail(result);
      if (!result) setMessage('El elemento ya no está disponible en el catálogo.');
    } catch {
      setMessage('No se pudo abrir el detalle del elemento.');
    }
  }

  return <main>
    <header>
      <h1>Presto Search</h1>
      <p>Buscador local de partidas y recursos BC3 importados.</p>
    </header>

    <section aria-labelledby="import-title">
      <h2 id="import-title">Importar catálogo</h2>
      <button aria-label="Importar catálogo" disabled={importing} onClick={importCatalog}>Seleccionar archivo BC3 aprobado</button>
      {importing && <p role="status">Importación en curso. {progressMessage(importProgress)}</p>}
      {importResult && !imported(importResult) && <p>La importación fue cancelada.</p>}
      {importResult && imported(importResult) && <div role="status">
        <p><strong>{importResult.sourceDisplayName}</strong>: {importResult.importedPartidas} partidas y {importResult.importedResources} recursos importados.</p>
        <p>Registros omitidos: {importResult.skippedRecords}. Importado: {new Date(importResult.completedAt).toLocaleString('es-ES')}.</p>
        {importResult.diagnostics.length > 0 && <section className="import-diagnostics-panel" aria-label="Panel de diagnósticos de importación" tabIndex={0}>
          <ul aria-label="Diagnósticos de importación">
            {importResult.diagnostics.map((diagnostic, index) => <li key={`${diagnostic.code}-${diagnostic.line}-${index}`}>
              {diagnostic.sourceDisplayName}, línea {diagnostic.line}: {diagnostic.messageEs}
            </li>)}
          </ul>
        </section>}
      </div>}
    </section>

    <section aria-labelledby="search-title">
      <h2 id="search-title">Buscar</h2>
      <label htmlFor="search-query">Términos de búsqueda</label>
      <input id="search-query" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void search()} />
      <button aria-label="Buscar" onClick={() => void search()}>Buscar</button>
      {searchResult?.status === 'empty-query' && <p role="status">Introduzca uno o más términos de búsqueda.</p>}
      {searchResult?.status === 'ok' && <>
        <p>{searchResult.items.length} resultados.</p>
        <ul className="results" aria-label="Resultados de búsqueda">
          {searchResult.items.map((item) => <li key={`${item.ref.source}-${item.ref.codeKey}`}>
            <button aria-label={`Ver detalle ${item.code}`} onClick={() => void openDetail(item.ref)}>
              <strong>{item.kind === 'partida' ? 'Partida' : 'Recurso'}</strong> {item.code}
            </button>
            <p>{item.description}</p>
            <small>{item.unit} · {item.price} · Fuente: {item.sourceDisplayName}</small>
          </li>)}
        </ul>
      </>}
    </section>

    {detail && <section aria-labelledby="detail-title">
      <h2 id="detail-title">{detail.kind === 'partida' ? `Desglose de ${detail.item.code}` : `Detalle de ${detail.item.code}`}</h2>
      <p>{detail.item.description}</p>
      <p>Fuente: {detail.item.sourceDisplayName} · {detail.item.unit} · {detail.item.price}</p>
      {detail.kind === 'partida' && <table>
        <thead><tr><th>Orden</th><th>Componente</th><th>Tipo</th><th>Factor</th><th>Rendimiento</th></tr></thead>
        <tbody>{detail.breakdown.map((line) => <tr key={line.ordinal}>
          <td>{line.ordinal + 1}</td><td>{line.component.code} — {line.component.description}</td><td>{line.component.kind === 'partida' ? 'Partida' : 'Recurso'}</td><td>{line.factor}</td><td>{line.yield}</td>
        </tr>)}</tbody>
      </table>}
    </section>}
    {message && <p role="alert">{message}</p>}
  </main>;
}
