import { useEffect, useRef, useState } from 'react';
import type { ItemDetail, ItemRef, SearchResponse } from '../domain/catalog';
import type { ImportProgress, ImportResponse, PrestoApi } from '../shared/ipc';
import { formatEightHourProductivity } from './productivity';

type RendererWindow = Window & typeof globalThis & { presto?: PrestoApi };

type ImportActivity =
  | { status: 'idle' }
  | { status: 'pending'; phase: ImportProgress['phase'] | null };

function imported(response: ImportResponse): response is Exclude<ImportResponse, { status: 'cancelled' }> {
  return !('status' in response);
}

function progressMessage(phase: ImportProgress['phase'] | null) {
  if (phase === 'parsing') return 'Analizando el catálogo BC3.';
  if (phase === 'storing') return 'Guardando el catálogo para buscarlo.';
  return 'Esperando la selección del archivo BC3.';
}

function itemIdentity(ref: ItemRef) {
  return JSON.stringify([ref.source, ref.codeKey]);
}

function resultIds(ref: ItemRef) {
  const suffix = encodeURIComponent(itemIdentity(ref));
  return { button: `result-trigger-${suffix}`, detail: `result-detail-${suffix}` };
}

function ResultDetail({ detail, id, labelledBy }: { detail: ItemDetail; id: string; labelledBy: string }) {
  return <section className="result-detail" id={id} aria-labelledby={labelledBy}>
    <h3>{detail.kind === 'partida' ? `Desglose de ${detail.item.code}` : `Detalle de ${detail.item.code}`}</h3>
    <p>{detail.item.description}</p>
    <p>Fuente: {detail.item.sourceDisplayName} · {detail.item.unit} · {detail.item.price}</p>
    {detail.kind === 'partida' && <table>
      <thead><tr><th>Orden</th><th>Componente</th><th>Tipo</th><th>Factor</th><th title="Horas necesarias por metro cuadrado">h / m²</th><th title="Metros cuadrados realizables en ocho horas">m² / 8 h</th></tr></thead>
      <tbody>{detail.breakdown.map((line) => <tr key={line.ordinal}>
        <td>{line.ordinal + 1}</td><td>{line.component.code} — {line.component.description}</td><td>{line.component.kind === 'partida' ? 'Partida' : 'Recurso'}</td><td>{line.factor}</td><td>{line.yield}</td><td>{formatEightHourProductivity(line.yield)}</td>
      </tr>)}</tbody>
    </table>}
  </section>;
}

export function App() {
  const [query, setQuery] = useState('');
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);
  const [importActivity, setImportActivity] = useState<ImportActivity>({ status: 'idle' });
  const importing = importActivity.status === 'pending';
  const [selectedIdentity, setSelectedIdentity] = useState<string | null>(null);
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const detailRequestVersion = useRef(0);
  const [message, setMessage] = useState<string | null>(null);
  const api = (window as RendererWindow).presto;

  useEffect(() => api?.onImportProgress((progress) => {
    setImportActivity((current) => current.status === 'pending'
      ? { status: 'pending', phase: progress.phase }
      : current);
  }), [api]);

  function clearDetailSelection() {
    detailRequestVersion.current += 1;
    setSelectedIdentity(null);
    setDetail(null);
  }

  async function importCatalog() {
    if (!api) return setMessage('La aplicación de escritorio no está disponible.');
    setMessage(null);
    clearDetailSelection();
    setImportResult(null);
    setImportActivity({ status: 'pending', phase: null });
    try {
      setImportResult(await api.importApprovedSource());
    } catch {
      setMessage('No se pudo importar el catálogo seleccionado.');
    } finally {
      setImportActivity({ status: 'idle' });
    }
  }

  async function search() {
    const trimmed = query.trim();
    clearDetailSelection();
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
    const identity = itemIdentity(source);
    if (identity === selectedIdentity) return clearDetailSelection();
    if (!api) return setMessage('La aplicación de escritorio no está disponible.');
    const version = ++detailRequestVersion.current;
    setSelectedIdentity(identity);
    setDetail(null);
    setMessage(null);
    try {
      const result = await api.getDetail(source);
      if (version !== detailRequestVersion.current) return;
      if (!result || itemIdentity(result.item.ref) !== identity) {
        clearDetailSelection();
        if (!result) setMessage('El elemento ya no está disponible en el catálogo.');
        return;
      }
      setDetail(result);
    } catch {
      if (version !== detailRequestVersion.current) return;
      clearDetailSelection();
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
      {importing && <p role="status">Importación en curso. {progressMessage(importActivity.phase)}</p>}
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
          {searchResult.items.map((item) => {
            const identity = itemIdentity(item.ref);
            const ids = resultIds(item.ref);
            const visibleDetail = selectedIdentity === identity && detail && itemIdentity(detail.item.ref) === identity ? detail : null;
            return <li key={identity}>
              <button id={ids.button} aria-expanded={selectedIdentity === identity} aria-controls={ids.detail} aria-label={`Ver detalle ${item.code}`} onClick={() => void openDetail(item.ref)}>
                <strong>{item.kind === 'partida' ? 'Partida' : 'Recurso'}</strong> {item.code}
              </button>
              <p>{item.description}</p>
              <small>{item.unit} · {item.price} · Fuente: {item.sourceDisplayName}</small>
              {visibleDetail && <ResultDetail detail={visibleDetail} id={ids.detail} labelledBy={ids.button} />}
            </li>;
          })}
        </ul>
      </>}
    </section>

    {message && <p role="alert">{message}</p>}
  </main>;
}
