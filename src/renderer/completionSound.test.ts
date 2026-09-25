// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

type CompletionSound = typeof import('./completionSound');

const storageKey = 'presto.import.completion-sound';

function throwingStorage() {
  return {
    getItem: () => { throw new Error('storage is disabled'); },
    setItem: () => { throw new Error('storage is disabled'); },
    removeItem: () => { throw new Error('storage is disabled'); },
    clear: () => { throw new Error('storage is disabled'); },
    key: () => { throw new Error('storage is disabled'); },
    get length() { return 0; },
  } as Storage;
}

async function freshModule(): Promise<CompletionSound> {
  vi.resetModules();
  return import('./completionSound');
}

const originalLocalStorage = window.localStorage;

beforeEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, 'localStorage', { configurable: true, value: originalLocalStorage });
  window.localStorage.clear();
  Object.defineProperty(window, 'AudioContext', { configurable: true, value: undefined });
  Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: undefined });
});

describe('completion sound setting', () => {
  it('is enabled by default when nothing is stored', async () => {
    const { isCompletionSoundEnabled } = await freshModule();
    expect(window.localStorage.getItem(storageKey)).toBeNull();
    expect(isCompletionSoundEnabled()).toBe(true);
  });

  it('persists the preference through localStorage', async () => {
    const { isCompletionSoundEnabled, setCompletionSoundEnabled } = await freshModule();
    setCompletionSoundEnabled(false);
    expect(isCompletionSoundEnabled()).toBe(false);
    expect(window.localStorage.getItem(storageKey)).toBe('false');
    setCompletionSoundEnabled(true);
    expect(isCompletionSoundEnabled()).toBe(true);
    expect(window.localStorage.getItem(storageKey)).toBe('true');
  });

  it('keeps the in-memory value and never throws when localStorage is broken', async () => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: throwingStorage() });
    const { isCompletionSoundEnabled, setCompletionSoundEnabled } = await freshModule();
    expect(() => setCompletionSoundEnabled(false)).not.toThrow();
    expect(isCompletionSoundEnabled()).toBe(false);
    expect(() => isCompletionSoundEnabled()).not.toThrow();
  });

  it('still returns the default when storage throws before any preference is set', async () => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: throwingStorage() });
    const { isCompletionSoundEnabled } = await freshModule();
    expect(() => isCompletionSoundEnabled()).not.toThrow();
    expect(isCompletionSoundEnabled()).toBe(true);
  });
});

describe('playCompletionSound', () => {
  it('does not throw when AudioContext is unavailable', async () => {
    const { playCompletionSound } = await freshModule();
    expect(() => playCompletionSound()).not.toThrow();
  });

  it('does not throw when the AudioContext constructor throws', async () => {
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: class { constructor() { throw new Error('no audio device'); } },
    });
    const { playCompletionSound } = await freshModule();
    expect(() => playCompletionSound()).not.toThrow();
  });

  it('schedules two sine notes, resumes, and closes the context after the last note', async () => {
    class FakeOscillator {
      type = '';
      frequency = { value: 0 };
      onended: (() => void) | null = null;
      connect = vi.fn();
      start = vi.fn();
      stop = vi.fn();
    }
    const oscillators: FakeOscillator[] = [];
    const close = vi.fn(() => Promise.resolve());
    const resume = vi.fn(() => Promise.resolve());
    class FakeAudioContext {
      currentTime = 1.5;
      destination = {};
      close = close;
      resume = resume;
      createOscillator = vi.fn(() => { const oscillator = new FakeOscillator(); oscillators.push(oscillator); return oscillator; });
      createGain = vi.fn(() => ({ gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() }));
    }
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: FakeAudioContext });
    const { playCompletionSound } = await freshModule();

    expect(() => playCompletionSound()).not.toThrow();
    expect(oscillators.map((oscillator) => oscillator.frequency.value)).toEqual([880, 1174.66]);
    expect(oscillators[0]!.type).toBe('sine');
    expect(oscillators[0]!.start).toHaveBeenCalledWith(1.5);
    expect(oscillators[1]!.start).toHaveBeenCalledWith(1.61);
    expect(oscillators[1]!.stop).toHaveBeenCalledWith(1.75);
    expect(resume).toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    oscillators[1]!.onended?.();
    expect(close).toHaveBeenCalled();
  });
});
