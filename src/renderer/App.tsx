import { useEffect, useRef, useState } from 'react';
import type { ItemDetail, ItemRef, SearchResponse } from '../domain/catalog';
import type { ImportProgress, ImportResponse, PrestoApi } from '../shared/ipc';
import { presentBreakdownQuantity } from './productivity';
import { isCompletionSoundEnabled, playCompletionSound, setCompletionSoundEnabled } from './completionSound';

type RendererWindow = Window & typeof globalThis & { presto?: PrestoApi };

type ProcessingProgress = Extract<ImportProgress, { stage: 'processing-records' }>;
type MeasuredProgress = Extract<ImportProgress, { completed: number; total: number }>;
type ImportActivity =
  | { status: 'idle' }
  | {
      status: 'pending';
      progress: ImportProgress | null;
      recordsProgress: ProcessingProgress | null;
      startedAt: number;
      milestones: string[];
      milestoneStage: ImportProgress['stage'] | null;
      milestoneBoundary: number;
    };

const importStages: ImportProgress['stage'][] = ['processing-records', 'validating-relations', 'storing'];

const SEARCH_PAGE_SIZE = 10;

function stageIndex(stage: ImportProgress['stage']) {
  return importStages.indexOf(stage);
}

function measuredPercent({ completed, total }: { completed: number; total: number }) {
  return total > 0 ? Math.min(100, Math.max(0, Math.floor((completed * 100) / total))) : null;
}

function imported(response: ImportResponse): response is Exclude<ImportResponse, { status: 'cancelled' }> {
  return !('status' in response);
}

function progressMessage(progress: ImportProgress | null) {
  if (progress?.stage === 'processing-records') {
    const percent = measuredPercent(progress);
    return percent === null ? 'Procesando registros BC3.' : `Procesando registros BC3: ${percent} %`;
  }
  if (progress?.stage === 'validating-relations') return 'Validando relaciones del catálogo…';
  if (progress?.stage === 'storing') {
    const percent = measuredPercent(progress);
    return percent === null ? 'Operaciones de guardado.' : `Operaciones de guardado: ${percent} %`;
  }
  return 'Esperando la selección del archivo BC3.';
}

function stageMessage(stage: ImportProgress['stage'], recordsProgress: ProcessingProgress | null) {
  if (stage === 'processing-records') return progressMessage(recordsProgress);
  if (stage === 'validating-relations') return 'Validando relaciones del catálogo…';
  return 'Operaciones de guardado.';
}

function stageAriaLabel(stage: ImportProgress['stage']) {
  if (stage === 'processing-records') return 'Progreso de procesamiento de registros';
  if (stage === 'validating-relations') return 'Progreso de validación de relaciones';
  return 'Progreso de operaciones de guardado';
}

function counterLabel(stage: MeasuredProgress['stage']) {
  return stage === 'processing-records' ? 'registros procesados' : 'operaciones de guardado';
}

function formatElapsed(seconds: number) {
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

function milestoneFor(progress: ImportProgress) {
  if (progress.stage === 'validating-relations') return null;
  const percent = measuredPercent(progress);
  if (percent === null) return null;
  const boundary = Math.floor(percent / 10) * 10;
  if (boundary < 10) return null;
  const completed = progress.completed.toLocaleString('es-ES');
  const total = progress.total.toLocaleString('es-ES');
  const label = progress.stage === 'processing-records' ? 'Registros procesados' : 'Operaciones de guardado';
  return { stage: progress.stage, boundary, line: `${label}: ${boundary} % (${completed} de ${total})` };
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
      <thead><tr><th>Orden</th><th>Componente</th><th title="Horas o cantidad del componente requeridas por unidad de la partida.">Hora/Unidad</th><th title="Unidades de la partida por día, calculadas al mostrar como 8 dividido por Hora/Unidad para una jornada fija de 8 horas.">Unidad/Día</th></tr></thead>
      <tbody>{detail.breakdown.map((line) => {
        const presentation = presentBreakdownQuantity({
          yieldText: line.yield,
          componentUnit: line.component.unit,
          parentUnit: detail.item.unit,
        });
        return <tr key={line.ordinal}>
          <td>{line.ordinal + 1}</td><td>{line.component.code} — {line.component.description}</td><td>{presentation.source}</td><td>{presentation.daily}</td>
        </tr>;
      })}</tbody>
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
  const searchRequestVersion = useRef(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [completionSoundEnabled, setCompletionSoundEnabledState] = useState(() => isCompletionSoundEnabled());
  const api = (window as RendererWindow).presto;

  useEffect(() => api?.onImportProgress((progress) => {
    setImportActivity((current) => {
      if (current.status !== 'pending') return current;
      const previous = current.progress;
      if (previous && stageIndex(progress.stage) < stageIndex(previous.stage)) return current;
      if (progress.stage === 'processing-records' && current.recordsProgress && progress.completed < current.recordsProgress.completed) return current;
      let { milestones, milestoneStage, milestoneBoundary } = current;
      const milestone = milestoneFor(progress);
      if (milestone) {
        if (milestone.stage !== milestoneStage) {
          milestoneStage = milestone.stage;
          milestoneBoundary = 0;
        }
        if (milestone.boundary > milestoneBoundary) {
          milestoneBoundary = milestone.boundary;
          milestones = [...milestones, milestone.line].slice(-20);
        }
      }
      return {
        status: 'pending',
        progress,
        recordsProgress: progress.stage === 'processing-records' ? progress : current.recordsProgress,
        startedAt: current.startedAt,
        milestones,
        milestoneStage,
        milestoneBoundary,
      };
    });
  }), [api]);

  useEffect(() => {
    if (!importing) return;
    // startedAt is captured once when the import starts; re-runs key on the importing transition only.
    const startedAt = importActivity.status === 'pending' ? importActivity.startedAt : Date.now();
    setElapsedSeconds(0);
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [importing]);

  function clearDetailSelection() {
    detailRequestVersion.current += 1;
    setSelectedIdentity(null);
    setDetail(null);
  }

  function toggleCompletionSound(enabled: boolean) {
    setCompletionSoundEnabledState(enabled);
    setCompletionSoundEnabled(enabled);
  }

  async function importCatalog() {
    if (!api) return setMessage('La aplicación de escritorio no está disponible.');
    setMessage(null);
    clearDetailSelection();
    setImportResult(null);
    setImportActivity({ status: 'pending', progress: null, recordsProgress: null, startedAt: Date.now(), milestones: [], milestoneStage: null, milestoneBoundary: 0 });
    try {
      const response = await api.importApprovedSource();
      setImportResult(response);
      if (imported(response) && completionSoundEnabled) playCompletionSound();
    } catch {
      if (completionSoundEnabled) playCompletionSound();
      setMessage('No se pudo importar el catálogo seleccionado.');
    } finally {
      setImportActivity({ status: 'idle' });
    }
  }

  async function search(offset = 0) {
    const trimmed = query.trim();
    clearDetailSelection();
    if (!trimmed) {
      searchRequestVersion.current += 1;
      setSearchResult({ status: 'empty-query' });
      return;
    }
    if (!api) return setMessage('La aplicación de escritorio no está disponible.');
    setMessage(null);
    const version = ++searchRequestVersion.current;
    try {
      const response = await api.search({ query: trimmed, limit: SEARCH_PAGE_SIZE, offset });
      if (version !== searchRequestVersion.current) return;
      setSearchResult(response);
    } catch {
      if (version !== searchRequestVersion.current) return;
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

  // The page is derived from the served window (offset/limit) so it cannot drift from the list.
  const okResult = searchResult?.status === 'ok' ? searchResult : null;
  const totalPages = okResult && okResult.limit > 0 ? Math.max(1, Math.ceil(okResult.total / okResult.limit)) : 1;
  const currentPage = okResult && okResult.limit > 0 ? Math.floor(okResult.offset / okResult.limit) + 1 : 1;

  return <main>
    <header>
      <h1>Presto Search</h1>
      <p>Buscador local de partidas y recursos BC3 importados.</p>
    </header>

    <section aria-labelledby="import-title">
      <h2 id="import-title">Importar catálogo</h2>
      <button aria-label="Importar catálogo" disabled={importing} onClick={importCatalog}>Seleccionar archivo BC3 aprobado</button>
      <label className="import-completion-sound">
        <input type="checkbox" checked={completionSoundEnabled} onChange={(event) => toggleCompletionSound(event.target.checked)} />
        Emitir un sonido al terminar
      </label>
      {importActivity.status === 'pending' && importActivity.progress !== null && <>
          <p role="status">Importación en curso. {progressMessage(importActivity.progress)}</p>
          {(() => {
            const { progress, milestones } = importActivity;
            const measured = progress && progress.stage !== 'validating-relations' ? progress : null;
            const percent = measured ? measuredPercent(measured) : null;
            return <>
              {progress && <progress aria-label={stageAriaLabel(progress.stage)} max={100} value={percent ?? undefined} />}
              {measured && <p className="import-counter">{measured.completed.toLocaleString('es-ES')} de {measured.total.toLocaleString('es-ES')} {counterLabel(measured.stage)}</p>}
              <p className="import-elapsed">Tiempo transcurrido: {formatElapsed(elapsedSeconds)}</p>
              {/* Not a live region: the role="status" line above is the single fast-changing live region,
                  so screen readers announce progress once instead of double-announcing every update. */}
              {milestones.length > 0 && <ul className="import-milestones" aria-label="Hitos de importación">
                {milestones.map((milestone, index) => <li key={index}>{milestone}</li>)}
              </ul>}
            </>;
          })()}
          <ol aria-label="Etapas de importación">
            {importStages.map((stage) => {
              const currentStage = importActivity.progress?.stage;
              const state = currentStage === stage ? 'En curso' : currentStage && stageIndex(stage) < stageIndex(currentStage) ? 'Completado' : 'Pendiente';
              return <li key={stage}>{stageMessage(stage, importActivity.recordsProgress)}: {state}.</li>;
            })}
          </ol>
        </>}
      {importResult && !imported(importResult) && <p>La importación fue cancelada.</p>}
      {importResult && imported(importResult) && importResult.unchanged === true && <div role="status">
        <p><strong>{importResult.sourceDisplayName}</strong>: el archivo no ha cambiado desde la última importación.</p>
        <p>Ya estaba importado: {new Date(importResult.completedAt).toLocaleString('es-ES')}.</p>
      </div>}
      {importResult && imported(importResult) && importResult.unchanged !== true && <div role="status">
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
      {okResult && <>
        <p>{okResult.total} resultados.</p>
        <ul className="results" aria-label="Resultados de búsqueda">
          {okResult.items.map((item) => {
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
        {totalPages > 1 && <nav className="results-pagination" aria-label="Paginación de resultados">
          <button type="button" aria-label="Página anterior" disabled={currentPage <= 1} onClick={() => void search(Math.max(0, okResult.offset - okResult.limit))}>Anterior</button>
          <p className="results-page-status" aria-live="polite">Página {currentPage} de {totalPages}</p>
          <button type="button" aria-label="Página siguiente" disabled={currentPage >= totalPages} onClick={() => void search(okResult.offset + okResult.limit)}>Siguiente</button>
        </nav>}
      </>}
    </section>

    {message && <p role="alert">{message}</p>}
  </main>;
}
