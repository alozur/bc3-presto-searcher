// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ItemDetail, SearchCandidate, SearchResponse } from '../domain/catalog';
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

  function item(source: 'guadalajara-2016-rm' | 'guadalajara-2016-eu', codeKey: string, code: string, kind: 'partida' | 'resource' = 'partida') {
    return { ref: { source, codeKey }, kind, code, description: `${code} description`, unit: kind === 'partida' ? 'm²' : 'l', price: '12.50', keywords: [], expandedText: code, sourceDisplayName: source, fieldCounts: { code: 1, description: 1, keywords: 0, expandedText: 1 }, exactCode: false } as SearchCandidate;
  }

  function partidaDetail(value: ReturnType<typeof item>, breakdown = [{ ordinal: 1, sourceLine: 9, component: { code: 'C2', kind: 'resource' as const, description: 'Second', unit: 'u', unitPrice: '2' }, factor: 'F2', yield: 'Y2' }, { ordinal: 0, sourceLine: 2, component: { code: 'C1', kind: 'partida' as const, description: 'First', unit: 'u', unitPrice: '1' }, factor: 'F1', yield: 'Y1' }]) {
    return { kind: 'partida' as const, item: value, breakdown };
  }

  function apiFor(search: SearchResponse, getDetail: PrestoApi['getDetail']): PrestoApi {
    return { importApprovedSource: vi.fn(async () => ({ status: 'cancelled' as const })), onImportProgress: vi.fn(() => () => undefined), search: vi.fn(async () => search), getDetail };
  }

  async function showResults(api: PrestoApi) {
    await render(api);
    const input = container.querySelector('input')!;
    await act(async () => enterText(input, 'x'));
    await act(async () => click(container.querySelector('button[aria-label="Buscar"]')!));
  }

  it('renders inline, preserves breakdown order, and keeps resources table-free', async () => {
    const partida = item('guadalajara-2016-eu', 'p1', 'P1');
    const resource = item('guadalajara-2016-eu', 'r1', 'R1', 'resource');
    const details = new Map<string, ItemDetail>([[partida.ref.codeKey, partidaDetail(partida)], [resource.ref.codeKey, { kind: 'resource', item: resource }]]);
    const api = apiFor({ status: 'ok', items: [partida, resource] }, vi.fn(async (ref) => details.get(ref.codeKey) ?? null));
    await showResults(api);
    const partidaButton = container.querySelector('button[aria-label="Ver detalle P1"]')!;
    await act(async () => click(partidaButton));
    const row = partidaButton.closest('li')!;
    const region = row.querySelector('section.result-detail')!;
    expect(region).toBeTruthy();
    expect(container.querySelectorAll('section.result-detail')).toHaveLength(1);
    expect(container.querySelector('ul[aria-label="Resultados de búsqueda"]')?.contains(region)).toBe(true);
    expect(row.lastElementChild).toBe(region);
    expect([...region.querySelectorAll('th')].map((cell) => cell.textContent)).toEqual(['Orden', 'Componente', 'Tipo', 'Factor', 'Rendimiento']);
    expect([...region.querySelectorAll('tbody tr')].map((line) => [...line.children].map((cell) => cell.textContent))).toEqual([['2', 'C2 — Second', 'Recurso', 'F2', 'Y2'], ['1', 'C1 — First', 'Partida', 'F1', 'Y1']]);
    await act(async () => click(container.querySelector('button[aria-label="Ver detalle R1"]')!));
    const resourceRegion = container.querySelector('button[aria-label="Ver detalle R1"]')!.closest('li')!.querySelector('section.result-detail')!;
    expect(resourceRegion.querySelector('table')).toBeNull();
    expect(container.querySelectorAll('section.result-detail')).toHaveLength(1);
  });

  it('replaces and collapses selected details', async () => {
    const a = item('guadalajara-2016-eu', 'a', 'A');
    const b = item('guadalajara-2016-eu', 'b', 'B');
    const getDetail = vi.fn(async (ref) => partidaDetail(ref.codeKey === 'a' ? a : b));
    await showResults(apiFor({ status: 'ok', items: [a, b] }, getDetail));
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('ul button')];
    expect(buttons.map((button) => button.getAttribute('aria-expanded'))).toEqual(['false', 'false']);
    await act(async () => click(buttons[0]));
    await act(async () => click(buttons[1]));
    expect(buttons[0].getAttribute('aria-expanded')).toBe('false');
    expect(buttons[1].getAttribute('aria-expanded')).toBe('true');
    expect(buttons[0].closest('li')?.querySelector('section.result-detail')).toBeNull();
    expect(container.querySelectorAll('section.result-detail')).toHaveLength(1);
    await act(async () => click(buttons[1]));
    expect(buttons.every((button) => button.getAttribute('aria-expanded') === 'false')).toBe(true);
    expect(container.querySelector('section.result-detail')).toBeNull();
    expect(getDetail).toHaveBeenCalledTimes(2);
  });

  it('gives same-code source results unique accessible disclosure ids', async () => {
    const eu = item('guadalajara-2016-eu', 'same', 'SAME');
    const rm = item('guadalajara-2016-rm', 'same', 'SAME');
    await showResults(apiFor({ status: 'ok', items: [eu, rm] }, vi.fn(async (ref) => partidaDetail(ref.source === eu.ref.source ? eu : rm))));
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('ul button')];
    expect(new Set(buttons.map((button) => button.id)).size).toBe(2);
    expect(new Set(buttons.map((button) => button.getAttribute('aria-controls'))).size).toBe(2);
    expect(buttons.every((button) => button.getAttribute('aria-expanded') === 'false')).toBe(true);
    await act(async () => click(buttons[0]));
    const region = container.querySelector('section.result-detail')!;
    expect(buttons[0].getAttribute('aria-controls')).toBe(region.id);
    expect(region.getAttribute('aria-labelledby')).toBe(buttons[0].id);
    expect(document.getElementById(region.id)).toBe(region);
    expect(document.getElementById(buttons[0].id)).toBe(buttons[0]);
  });

  it('ignores stale replacement, collapse, and ABA responses', async () => {
    const a = item('guadalajara-2016-eu', 'a', 'A');
    const b = item('guadalajara-2016-eu', 'b', 'B');
    const pending = new Map<string, (value: ItemDetail | null) => void>();
    const getDetail = vi.fn((ref) => new Promise<ItemDetail | null>((resolve) => pending.set(`${ref.codeKey}-${getDetail.mock.calls.length}`, resolve)));
    await showResults(apiFor({ status: 'ok', items: [a, b] }, getDetail));
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('ul button')];
    await act(async () => click(buttons[0]));
    await act(async () => click(buttons[1]));
    await act(async () => pending.get('b-2')?.(partidaDetail(b)));
    expect(container.textContent).toContain('Desglose de B');
    await act(async () => pending.get('a-1')?.(partidaDetail(a)));
    expect(container.textContent).not.toContain('Desglose de A');
    await act(async () => click(buttons[1]));
    await act(async () => click(buttons[0]));
    expect(pending.has('a-3')).toBe(true);
    await act(async () => click(buttons[0]));
    await act(async () => pending.get('a-3')!(partidaDetail(a)));
    expect(container.querySelector('section.result-detail')).toBeNull();

    await act(async () => click(buttons[0]));
    await act(async () => click(buttons[1]));
    await act(async () => click(buttons[0]));
    expect(pending.has('a-4')).toBe(true);
    expect(pending.has('b-5')).toBe(true);
    expect(pending.has('a-6')).toBe(true);
    await act(async () => pending.get('a-4')!(partidaDetail(a)));
    await act(async () => pending.get('b-5')!(partidaDetail(b)));
    expect(container.querySelector('section.result-detail')).toBeNull();
    await act(async () => pending.get('a-6')!(partidaDetail(a)));
    expect(container.textContent).toContain('Desglose de A');
  });

  it('ignores stale null and rejection completions', async () => {
    const a = item('guadalajara-2016-eu', 'a', 'A');
    const b = item('guadalajara-2016-eu', 'b', 'B');
    const pending = new Map<string, { resolve: (value: ItemDetail | null) => void; reject: (error: Error) => void }>();
    const getDetail = vi.fn((ref) => new Promise<ItemDetail | null>((resolve, reject) => pending.set(`${ref.codeKey}-${getDetail.mock.calls.length}`, { resolve, reject })));
    await showResults(apiFor({ status: 'ok', items: [a, b] }, getDetail));
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('ul button')];
    await act(async () => click(buttons[0]));
    await act(async () => click(buttons[1]));
    await act(async () => pending.get('a-1')?.resolve(null));
    expect(buttons[1].getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await act(async () => click(buttons[1]));
    await act(async () => click(buttons[0]));
    await act(async () => click(buttons[1]));
    await act(async () => pending.get('a-3')?.reject(new Error('late')));
    await act(async () => pending.get('b-4')?.resolve(partidaDetail(b)));
    expect(buttons[0].getAttribute('aria-expanded')).toBe('false');
    expect(buttons[1].getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
