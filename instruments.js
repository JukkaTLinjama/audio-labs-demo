// Web Audio instrument factory for the procedural program source.
// Musical timing and note selection live outside this module.

const db = (value) => Math.pow(10, value / 20);
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function midi(note) {
  const m = /^([A-G])(#|b)?(\d)$/.exec(note);
  let s = SEMI[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  return (+m[3] + 1) * 12 + s;
}
function noteFromMidi(value) {
  return NAMES[((value % 12) + 12) % 12] + (Math.floor(value / 12) - 1);
}
function hz(note) {
  return 440 * Math.pow(2, (midi(note) - 69) / 12);
}
function fitNoteToRange(note, minHz, maxHz, scale = 1) {
  let value = midi(note),
    frequency = hz(note) * scale;
  while (frequency > maxHz) {
    value -= 12;
    frequency /= 2;
  }
  while (frequency < minHz) {
    value += 12;
    frequency *= 2;
  }
  return noteFromMidi(value);
}
function createImpulse(ctx, seconds = 2.2, decay = 2.8, rng = Math.random) {
  const len = Math.floor(ctx.sampleRate * seconds),
    buffer = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < len; i++)
      data[i] = (rng() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buffer;
}

// EN: These are the versioned musical defaults; browser audition state is never a committed mix.
export const COMMITTED_MIX = Object.freeze({
  master: -14,
  bell: -10,
  treble: 0,
  bass: -13,
  sub: -16,
  reverb: 0,
  transpose: 24,
  contentTranspose: 0,
});

export function createInstruments(ctx, output, { random = Math.random } = {}) {
  const masterGain = ctx.createGain(),
    bellGain = ctx.createGain(),
    trebleGain = ctx.createGain(),
    bassGain = ctx.createGain(),
    ornBassGain = ctx.createGain(),
    subGain = ctx.createGain(),
    dryGain = ctx.createGain(),
    wetGain = ctx.createGain(),
    convolver = ctx.createConvolver();
  convolver.buffer = createImpulse(ctx, 2.2, 2.8, random);
  [bellGain, trebleGain, bassGain, ornBassGain].forEach((g) => {
    g.connect(dryGain);
    g.connect(convolver);
  });
  dryGain.connect(masterGain);
  convolver.connect(wetGain);
  wetGain.connect(masterGain);
  subGain.connect(masterGain);
  masterGain.connect(output);

  // User values are live trims. Phrasing supplies the musical treble/reverb trajectory.
  const params = { ...COMMITTED_MIX };
  let phrase = { trebleDb: -20, reverbMix: 0.3 };

  function applyLevels(atTime = ctx.currentTime) {
    const t = atTime;
    const mix = clamp(phrase.reverbMix + params.reverb, 0, 0.9);
    const trebleDb = phrase.trebleDb + params.treble;
    masterGain.gain.setTargetAtTime(db(params.master), t, 0.02);
    bellGain.gain.setTargetAtTime(db(params.bell), t, 0.02);
    trebleGain.gain.setTargetAtTime(db(trebleDb), t, 0.04);
    bassGain.gain.setTargetAtTime(db(params.bass), t, 0.02);
    ornBassGain.gain.setTargetAtTime(db(params.bass - 3), t, 0.02);
    subGain.gain.setTargetAtTime(db(params.sub), t, 0.04);
    dryGain.gain.setTargetAtTime(1 - mix * 0.55, t, 0.06);
    wetGain.gain.setTargetAtTime(mix, t, 0.08);
  }

  // Content transpose moves every layer together; treble transpose remains a separate color control.
  function resolveNote(event) {
    const contentOffset = Math.round(params.contentTranspose);
    if (event.sourceNote) {
      const offset =
        contentOffset +
        Math.round(params.transpose) +
        (event.ornamentOffset || 0);
      return noteFromMidi(midi(event.sourceNote) + offset);
    }
    const transposed = noteFromMidi(midi(event.note) + contentOffset);
    // Preserve pitch class while keeping pedal and sub fundamentals in usable ranges.
    if (["bass", "bass2", "outroBass", "ornBass"].includes(event.inst))
      return fitNoteToRange(transposed, 41, 98);
    if (event.inst === "sub") return fitNoteToRange(transposed, 25, 50, 0.5);
    return transposed;
  }

  function playBell(
    note,
    when,
    dur,
    target = bellGain,
    bright = false,
    velocity = 1,
  ) {
    const c = ctx.createOscillator(),
      m = ctx.createOscillator(),
      mg = ctx.createGain(),
      g = ctx.createGain(),
      f = hz(note),
      release = Math.max(0.055, dur);
    c.type = m.type = "sine";
    c.frequency.setValueAtTime(f, when);
    m.frequency.setValueAtTime(f * (bright ? 3.08 : 2.72), when);
    mg.gain.setValueAtTime(f * (bright ? 0.82 : 0.62), when);
    mg.gain.exponentialRampToValueAtTime(
      1,
      when + Math.min(0.18, release * 0.7),
    );
    g.gain.setValueAtTime(0.0001, when);
    const octavesAboveC6 = Math.max(0, (midi(note) - 84) / 12),
      pitchTrim = db(-Math.min(6, octavesAboveC6 * (bright ? 3 : 1.5)));
    g.gain.exponentialRampToValueAtTime(
      (bright ? 0.095 : 0.14) * pitchTrim * velocity,
      when + 0.005,
    );
    g.gain.exponentialRampToValueAtTime(0.0001, when + release);
    m.connect(mg);
    mg.connect(c.frequency);
    c.connect(g);
    g.connect(target);
    m.start(when);
    c.start(when);
    m.stop(when + release + 0.04);
    c.stop(when + release + 0.04);
  }

  function playBass(
    note,
    when,
    dur,
    target = bassGain,
    peak = 0.12,
    velocity = 1,
  ) {
    const o1 = ctx.createOscillator(),
      o2 = ctx.createOscillator(),
      lp = ctx.createBiquadFilter(),
      hp = ctx.createBiquadFilter(),
      g = ctx.createGain(),
      f = hz(note);
    o1.type = "triangle";
    o2.type = "sine";
    o1.frequency.setValueAtTime(f, when);
    o2.frequency.setValueAtTime(f * 2, when);
    hp.type = "highpass";
    hp.frequency.setValueAtTime(58, when);
    hp.Q.value = 0.55;
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(260, when);
    lp.Q.value = 0.65;
    const scaledPeak = peak * velocity;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(
      scaledPeak,
      when + Math.min(0.045, dur * 0.2),
    );
    g.gain.setValueAtTime(scaledPeak, when + dur * 0.46);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o1.connect(hp);
    o2.connect(hp);
    hp.connect(lp);
    lp.connect(g);
    g.connect(target);
    o1.start(when);
    o2.start(when);
    o1.stop(when + dur + 0.05);
    o2.stop(when + dur + 0.05);
  }

  function playSub(note, when, dur, velocity = 1) {
    const o = ctx.createOscillator(),
      h = ctx.createOscillator(),
      hg = ctx.createGain(),
      g = ctx.createGain(),
      lp = ctx.createBiquadFilter(),
      f = hz(note) * 0.5,
      attack = 0.4,
      release = 0.8,
      end = when + dur,
      peak = 0.16 * velocity;
    o.type = h.type = "sine";
    o.frequency.setValueAtTime(f, when);
    h.frequency.setValueAtTime(f * 2, when);
    hg.gain.value = 0.26;
    lp.type = "lowpass";
    lp.frequency.value = 130;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + attack);
    g.gain.setValueAtTime(peak, end);
    g.gain.exponentialRampToValueAtTime(0.0001, end + release);
    o.connect(lp);
    h.connect(hg);
    hg.connect(lp);
    lp.connect(g);
    g.connect(subGain);
    o.start(when);
    h.start(when);
    o.stop(end + release + 0.08);
    h.stop(end + release + 0.08);
  }

  function playEvent(event, absoluteWhen) {
    // EN: Phrase automation must be scheduled at the note time for live and offline rendering to agree.
    if (event.phrase) {
      phrase = event.phrase;
      applyLevels(absoluteWhen);
    }
    const when = absoluteWhen + (event.timingOffset || 0),
      velocity = clamp(Number(event.velocity) || 1, 0.05, 1);
    const note = resolveNote(event);
    if (["bell", "outro", "outroFinal"].includes(event.inst))
      playBell(note, when, event.dur, bellGain, false, velocity);
    else if (["treble", "ornTreble"].includes(event.inst))
      playBell(note, when, event.dur, trebleGain, true, velocity);
    else if (["bass", "bass2", "outroBass"].includes(event.inst))
      playBass(note, when, event.dur, bassGain, 0.11, velocity);
    else if (event.inst === "ornBass")
      playBass(note, when, event.dur, ornBassGain, 0.085, velocity);
    else if (event.inst === "sub") playSub(note, when, event.dur, velocity);
  }

  applyLevels();
  return {
    playEvent,
    setPhraseState(next) {
      phrase = { ...phrase, ...next };
      applyLevels();
    },
    setParam(name, value) {
      if (!(name in params) || !Number.isFinite(value)) return false;
      params[name] = value;
      applyLevels();
      return true;
    },
    setParams(next) {
      Object.entries(next).forEach(([name, value]) => {
        if (name in params && Number.isFinite(value)) params[name] = value;
      });
      applyLevels();
    },
    getParam(name) {
      return params[name];
    },
    resolveEvent(event) {
      return { ...event, note: resolveNote(event) };
    },
  };
}
