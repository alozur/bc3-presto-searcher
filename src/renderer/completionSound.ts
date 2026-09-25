const storageKey = 'presto.import.completion-sound';

// Peak gain of the chime. The original 0.08 was about -22 dB and was barely
// audible on ordinary speakers; this sits around -6 dB, loud enough to notice
// from across the room without being startling. Tune here.
const chimePeakGain = 0.5;

// Session-only fallback for environments where localStorage throws
// (disabled storage, quota errors, opaque origins).
let inMemoryValue: boolean | null = null;

function readStoredValue(): string | null {
  return window.localStorage.getItem(storageKey);
}

export function isCompletionSoundEnabled(): boolean {
  try {
    const stored = readStoredValue();
    if (stored === 'true') return true;
    if (stored === 'false') return false;
  } catch {
    // Storage is unreadable; fall back to the in-memory value below.
  }
  return inMemoryValue ?? true;
}

export function setCompletionSoundEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(storageKey, enabled ? 'true' : 'false');
    inMemoryValue = null;
  } catch {
    inMemoryValue = enabled;
  }
}

type AudioContextWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };

export function playCompletionSound(): void {
  try {
    const contextWindow = window as AudioContextWindow;
    const ContextConstructor = contextWindow.AudioContext ?? contextWindow.webkitAudioContext;
    if (!ContextConstructor) return;
    const context = new ContextConstructor();
    const now = context.currentTime;
    const notes: ReadonlyArray<{ readonly frequency: number; readonly offset: number }> = [
      { frequency: 880, offset: 0 },
      { frequency: 1174.66, offset: 0.11 },
    ];
    let lastOscillator: OscillatorNode | null = null;
    for (const { frequency, offset } of notes) {
      const at = now + offset;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(chimePeakGain, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.14);
      lastOscillator = oscillator;
    }
    try {
      void context.resume().catch(() => undefined);
    } catch {
      // resume() may reject synchronously in restricted environments.
    }
    lastOscillator!.onended = () => {
      try {
        void context.close().catch(() => undefined);
      } catch {
        // The context may already be closed.
      }
    };
  } catch {
    // No audio device or blocked audio: stay silent instead of crashing.
  }
}
