let audioCtx = null;
let master = null;

export function ensureCtx() {
  try {
    if (!audioCtx) {
      const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextCtor) return null;
      audioCtx = new AudioContextCtor();
      master = audioCtx.createGain();
      master.gain.value = 0.35;
      master.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') {
      const resumed = audioCtx.resume();
      if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {});
    }
    return audioCtx;
  } catch {
    audioCtx = null;
    master = null;
    return null;
  }
}

function tone(freq, dur, type = 'sine', gain = 0.15, delay = 0, slideTo = null) {
  try {
    const ctx = ensureCtx();
    if (!ctx || !master || !(freq > 0) || !(dur > 0) || !(gain > 0)) return;
    const t0 = ctx.currentTime + Math.max(0, delay);
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo && slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env);
    env.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch {}
}

export function blip(freq, dur, type = 'sine', gain = 0.15) {
  tone(freq, dur, type, gain, 0);
}

export function sfx(name) {
  try {
    switch (name) {
      case 'boil':
        tone(180, 0.2, 'sine', 0.1);
        break;
      case 'add':
        blip(660, 0.08, 'square', 0.12);
        break;
      case 'broth':
        tone(440, 0.24, 'triangle', 0.14, 0, 520);
        break;
      case 'serve':
        tone(784, 0.12, 'sine', 0.16);
        tone(988, 0.18, 'sine', 0.16, 0.1);
        break;
      case 'coin':
        tone(1320, 0.07, 'sine', 0.14);
        tone(1760, 0.1, 'sine', 0.14, 0.07);
        break;
      case 'angry':
        tone(140, 0.25, 'sawtooth', 0.16);
        break;
      case 'click':
        blip(900, 0.03, 'square', 0.08);
        break;
      case 'win':
        [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.12, 'triangle', 0.14, i * 0.09));
        break;
      case 'lose':
        [400, 300, 200].forEach((f, i) => tone(f, 0.16, 'sawtooth', 0.12, i * 0.12));
        break;
      default:
        break;
    }
  } catch {}
}
