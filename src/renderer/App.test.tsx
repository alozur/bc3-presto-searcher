// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
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

  it('keeps import summaries visible while diagnostics scroll independently', async () => {
    const diagnostics = [
      { code: 'ignored-record', sourceDisplayName: 'short.bc3', line: 4, messageEs: 'Registro omitido.' },
      { code: 'ignored-record', sourceDisplayName: 'a-very-long-filename-that-must-remain-readable-without-horizontal-scrolling.bc3', line: 8, messageEs: 'Este mensaje de diagnóstico también es deliberadamente largo y debe conservarse completo.' },
      ...Array.from({ length: 8 }, (_, index) => ({ code: 'ignored-record', sourceDisplayName: `file-${index}.bc3`, line: index + 10, messageEs: `Diagnóstico ${index}.` })),
    ];
    const api: PrestoApi = {
      importApprovedSource: vi.fn(async () => ({ source: 'guadalajara-2016-eu' as const, sourceDisplayName: 'catalog.bc3', importedPartidas: 12, importedResources: 34, skippedRecords: diagnostics.length, diagnostics, completedAt: '2025-01-01T00:00:00.000Z' })),
      onImportProgress: vi.fn(() => () => undefined),
      search: vi.fn(async () => ({ status: 'empty-query' as const })),
      getDetail: vi.fn(async () => null),
    };
    await render(api);

    await act(async () => click(container.querySelector('button[aria-label="Importar catálogo"]')!));

    const status = container.querySelector('div[role="status"]')!;
    const panel = status.querySelector('section.import-diagnostics-panel[aria-label="Panel de diagnósticos de importación"]')!;
    const list = panel.querySelector('ul[aria-label="Diagnósticos de importación"]')!;
    const summaries = Array.from(status.children).filter((child): child is HTMLParagraphElement => child.tagName === 'P');
    expect(summaries).toHaveLength(2);
    expect(summaries[0].textContent).toContain('catalog.bc3');
    expect(summaries[0].textContent).toContain('12 partidas y 34 recursos importados');
    expect(summaries[1].textContent).toContain(`Registros omitidos: ${diagnostics.length}`);
    expect(summaries[1].textContent).toContain(new Date('2025-01-01T00:00:00.000Z').toLocaleString('es-ES'));
    expect(summaries.every((summary) => !panel.contains(summary))).toBe(true);
    expect(Array.from(panel.children)).toEqual([list]);
    expect((panel as HTMLElement).tabIndex).toBe(0);
    expect(Array.from(list.children).map((item) => item.textContent)).toEqual(diagnostics.map((diagnostic) => `${diagnostic.sourceDisplayName}, línea ${diagnostic.line}: ${diagnostic.messageEs}`));
    expect(list.textContent).toContain('a-very-long-filename-that-must-remain-readable-without-horizontal-scrolling.bc3');
    expect(list.textContent).toContain('Este mensaje de diagnóstico también es deliberadamente largo y debe conservarse completo.');

    const rendererCss = readFileSync('src/renderer/style.css', 'utf8');
    const panelRule = rendererCss.match(/\.import-diagnostics-panel\s*\{([^}]*)\}/)?.[1];
    expect(panelRule).toBeDefined();
    expect(panelRule).toMatch(/max-height:\s*12rem;/);
    expect(panelRule).toMatch(/overflow-y:\s*auto;/);
    expect(panelRule).toMatch(/overflow-x:\s*hidden;/);
    expect(panelRule).toMatch(/overflow-wrap:\s*anywhere;/);
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
