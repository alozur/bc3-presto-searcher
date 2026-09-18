// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ItemDetail, SearchResponse } from '../domain/catalog';
import type { PrestoApi } from '../shared/ipc';
import { App } from './App';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function click(element: Element) {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function enterText(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function render(api: PrestoApi) {
  Object.defineProperty(window, 'presto', { configurable: true, value: api });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<App />));
}

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
});

describe('Presto catalog screen', () => {
  it('guides blank searches, reports imports, shows mixed results, and opens E11XM020 detail', async () => {
    const search: SearchResponse = {
      status: 'ok',
      items: [
        { ref: { source: 'guadalajara-2016-eu', codeKey: 'e11xm020' }, kind: 'partida', code: 'E11XM020', description: 'Barnizado al agua', unit: 'm²', price: '12.50', keywords: ['barnizado'], expandedText: 'Barnizado al agua', sourceDisplayName: 'Guadalajara2016_e+u.bc3', fieldCounts: { code: 1, description: 1, keywords: 1, expandedText: 1 }, exactCode: true },
        { ref: { source: 'guadalajara-2016-eu', codeKey: 'p25mv040' }, kind: 'resource', code: 'P25MV040', description: 'Barniz al agua', unit: 'l', price: '28.99', keywords: ['barniz'], expandedText: 'Barniz al agua', sourceDisplayName: 'Guadalajara2016_e+u.bc3', fieldCounts: { code: 0, description: 1, keywords: 1, expandedText: 1 }, exactCode: false },
      ],
    };
    const detail: ItemDetail = { kind: 'partida', item: search.items[0], breakdown: [{ ordinal: 0, sourceLine: 3, component: { code: 'P25MV040', kind: 'resource', description: 'Barniz al agua', unit: 'l', unitPrice: '28.99' }, factor: '1', yield: '0.3' }] };
    const api: PrestoApi = {
      importApprovedSource: vi.fn(async () => ({ source: 'guadalajara-2016-eu' as const, sourceDisplayName: 'Guadalajara2016_e+u.bc3', importedPartidas: 1, importedResources: 3, skippedRecords: 1, diagnostics: [{ code: 'ignored-record', sourceDisplayName: 'Guadalajara2016_e+u.bc3', line: 9, messageEs: 'Registro omitido.' }], completedAt: '2025-01-01T00:00:00.000Z' })),
      onImportProgress: vi.fn(() => () => undefined),
      search: vi.fn(async () => search),
      getDetail: vi.fn(async () => detail),
    };
    await render(api);

    await act(async () => click(container.querySelector('button[aria-label="Buscar"]')!));
    expect(container.textContent).toContain('Introduzca uno o más términos de búsqueda.');
    await act(async () => click(container.querySelector('button[aria-label="Importar catálogo"]')!));
    expect(container.textContent).toContain('1 partidas y 3 recursos importados');
    expect(container.textContent).toContain('Registro omitido.');

    const input = container.querySelector('input')!;
    await act(async () => enterText(input, 'barniz'));
    await act(async () => click(container.querySelector('button[aria-label="Buscar"]')!));
    expect(container.textContent).toContain('Partida');
    expect(container.textContent).toContain('Recurso');
    await act(async () => click(container.querySelector('button[aria-label="Ver detalle E11XM020"]')!));
    expect(container.textContent).toContain('Desglose de E11XM020');
  });

  it('shows worker import state while search remains available', async () => {
    let reportProgress: ((progress: { phase: 'parsing' | 'storing' }) => void) | undefined;
    let completeImport: ((response: Awaited<ReturnType<PrestoApi['importApprovedSource']>>) => void) | undefined;
    const api: PrestoApi = {
      importApprovedSource: vi.fn(() => new Promise<Awaited<ReturnType<PrestoApi['importApprovedSource']>>>((resolve) => { completeImport = resolve; })),
      onImportProgress: vi.fn((listener) => { reportProgress = listener; return () => undefined; }),
      search: vi.fn(async () => ({ status: 'empty-query' as const })),
      getDetail: vi.fn(async () => null),
    };
    await render(api);

    await act(async () => click(container.querySelector('button[aria-label="Importar catálogo"]')!));
    expect(container.textContent).toContain('Importación en curso');
    expect((container.querySelector('button[aria-label="Importar catálogo"]') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => reportProgress?.({ phase: 'parsing' }));
    expect(container.textContent).toContain('Analizando el catálogo BC3');

    const input = container.querySelector('input')!;
    await act(async () => enterText(input, 'barniz'));
    await act(async () => click(container.querySelector('button[aria-label="Buscar"]')!));
    expect(api.search).toHaveBeenCalledWith({ query: 'barniz' });

    await act(async () => completeImport?.({ source: 'guadalajara-2016-eu', sourceDisplayName: 'Guadalajara2016_e+u.bc3', importedPartidas: 1, importedResources: 3, skippedRecords: 0, diagnostics: [], completedAt: '2025-01-01T00:00:00.000Z' }));
    expect(container.textContent).toContain('1 partidas y 3 recursos importados');
  });
});
