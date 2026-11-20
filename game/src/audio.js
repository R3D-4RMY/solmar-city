// Synthesised sound only — no audio files, no network. Everything is WebAudio oscillators
// and filtered noise, started on the first user gesture (browsers require that).
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioCtx();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filterFreq) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 800;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t);
  }

  return {
    unlock,
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    click() {
      blip(660, 0.07, 'square', 0.08);
    },
    pickup() {
      blip(523, 0.09, 'sine', 0.22);
      setTimeout(() => blip(784, 0.12, 'sine', 0.22), 80);
    },
    coin() {
      blip(988, 0.08, 'sine', 0.18);
      setTimeout(() => blip(1319, 0.14, 'sine', 0.18), 70);
    },
    punch() {
      noise(0.12, 0.35, 500);
    },
    crash() {
      noise(0.35, 0.5, 400);
      blip(90, 0.25, 'sawtooth', 0.25, 40);
    },
    horn() {
      blip(370, 0.35, 'sawtooth', 0.12);
      blip(466, 0.35, 'sawtooth', 0.1);
    },
    mission() {
      [523, 659, 784, 1047].forEach((freq, i) => setTimeout(() => blip(freq, 0.16, 'triangle', 0.22), i * 110));
    },
    busted() {
      [392, 330, 262].forEach((freq, i) => setTimeout(() => blip(freq, 0.22, 'sawtooth', 0.16), i * 160));
    },
    /** Continuous engine hum; call every frame with speed 0..1 and whether driving. */
    engine(speed, driving) {
      if (!ensure() || muted) {
        if (engineGain) engineGain.gain.value = 0;
        return;
      }
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineFilter = ctx.createBiquadFilter();
        engineFilter.type = 'lowpass';
        engineFilter.frequency.value = 420;
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        engineOsc.connect(engineFilter);
        engineFilter.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
      const target = driving ? 0.05 + speed * 0.06 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(55 + speed * 130, ctx.currentTime, 0.08);
    },
    /** Two-tone police siren while wanted; call every frame. */
    siren(dt, wanted) {
      if (!ensure() || muted || wanted === 0) {
        if (sirenGain) sirenGain.gain.value = 0;
        return;
      }
      if (!sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'triangle';
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
      }
      sirenTimer += dt;
      const tone = Math.floor(sirenTimer / 0.45) % 2 === 0 ? 660 : 880;
      sirenOsc.frequency.setTargetAtTime(tone, ctx.currentTime, 0.03);
      sirenGain.gain.setTargetAtTime(0.035, ctx.currentTime, 0.1);
    },
  };
}
