// Local-only playback. The file never leaves the device: object URL + AnalyserNode.

// Attack is fast enough for a kick or a hat to read; release is slower so the
// cloud blooms instead of flickering. Mids move slowest — they steer the flow.
const ATTACK = { bass: 0.02, mids: 0.14, highs: 0.035 };
const RELEASE = { bass: 0.26, mids: 0.7, highs: 0.16 };

// Per-band dynamics, tuned against a mastered track whose analyser bytes otherwise
// sit in a narrow loud range. Floor drops quickly when a band gets quiet (so a
// breakdown or the gap between kicks reads as calm) and rises slowly, so one
// loud section does not become the new silence. Peak grabs transients and
// forgets them over a couple of seconds. Min span stops tiny ripples from
// being stretched to a full burst.
const FLOOR_FALL = 0.32;
const FLOOR_RISE = 7.5;
const PEAK_RELEASE = 2.0;
const MIN_SPAN = 0.16;
const SILENCE_PEAK = 0.07;

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

function follow(current, target, dt, attack, release) {
  const tau = target > current ? attack : release;
  const k = 1 - Math.exp(-dt / Math.max(0.001, tau));
  return current + (target - current) * k;
}

function demoTargets(time) {
  const cycle = 2.4;
  const phase = ((time + 1.6) % cycle) / cycle;
  let kick = 0;
  if (phase < 0.12) {
    const k = Math.sin((phase / 0.12) * Math.PI);
    kick = Math.pow(k, 1.35);
  }
  const bass = 0.06 + kick * 0.94;
  const mids = 0.3 + 0.22 * Math.sin(time * 0.37) + 0.06 * Math.sin(time * 0.13);
  const highs = 0.16 + 0.34 * (0.5 + 0.5 * Math.sin(time * 5.2)) * (0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(time * 0.71), 2));
  return {
    bass: clamp01(bass),
    mids: clamp01(mids),
    highs: clamp01(highs),
  };
}

export function createAudio(player) {
  let ctx = null;
  let analyser = null;
  let source = null;
  let freq = null;
  let objectUrl = null;
  let hasFile = false;
  let fileName = "";

  const smooth = { bass: 0.08, mids: 0.28, highs: 0.16 };
  const peaks = { bass: 0.35, mids: 0.35, highs: 0.3 };
  const floors = { bass: 0.22, mids: 0.2, highs: 0.16 };
  let prevBassTarget = 0;
  let prevRawBass = 0;
  let lagBass = 0.2;
  let shock = 0;
  let shockCooldown = 0;
  let shockRadius = 0.05;
  let midPhase = 0;

  function resetDynamics() {
    peaks.bass = 0.35;
    peaks.mids = 0.35;
    peaks.highs = 0.3;
    floors.bass = 0.22;
    floors.mids = 0.2;
    floors.highs = 0.16;
    prevBassTarget = 0;
    prevRawBass = 0;
    lagBass = 0.2;
    shock = 0;
    shockCooldown = 0;
    shockRadius = 0.05;
  }

  function unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      // iOS 16.4+: play even when the ring/silent switch is on, when the browser allows it.
      try {
        if (navigator.audioSession) navigator.audioSession.type = "playback";
      } catch {
        /* older iOS ignores audioSession */
      }
      const buffer = ctx.createBuffer(1, 1, 22050);
      const silent = ctx.createBufferSource();
      silent.buffer = buffer;
      silent.connect(ctx.destination);
      try {
        silent.start(0);
      } catch {
        /* already started */
      }
    }
    if (ctx.state === "suspended") {
      ctx.resume();
    }
    return ctx;
  }

  function ensureGraph() {
    if (!ctx || source) return;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0;
    // -78..-8 keeps a mastered kick inside the meter instead of slamming the top,
    // while a quiet breakdown still sits above the floor.
    analyser.minDecibels = -78;
    analyser.maxDecibels = -8;
    freq = new Uint8Array(analyser.frequencyBinCount);
    source = ctx.createMediaElementSource(player);
    source.connect(analyser);
    analyser.connect(ctx.destination);
  }

  function band(startHz, endHz) {
    const nyquist = ctx.sampleRate / 2;
    const n = freq.length;
    let a = Math.max(1, Math.floor((startHz / nyquist) * n));
    let b = Math.min(n, Math.ceil((endHz / nyquist) * n));
    if (b <= a) b = Math.min(n, a + 1);
    let sum = 0;
    let peak = 0;
    let count = 0;
    for (let i = a; i < b; i += 1) {
      const v = freq[i] / 255;
      sum += v * v;
      if (v > peak) peak = v;
      count += 1;
    }
    if (!count) return 0;
    const rms = Math.sqrt(sum / count);
    return clamp01(rms * 0.7 + peak * 0.3);
  }

  function expand(key, raw, dt, curve) {
    const floorTau = raw < floors[key] ? FLOOR_FALL : FLOOR_RISE;
    const floorK = 1 - Math.exp(-dt / floorTau);
    floors[key] += (raw - floors[key]) * floorK;
    peaks[key] = Math.max(raw, peaks[key] * Math.exp(-dt / PEAK_RELEASE));
    if (peaks[key] < SILENCE_PEAK) return 0;
    const span = Math.max(MIN_SPAN, peaks[key] - floors[key]);
    const n = clamp01((raw - floors[key]) / span);
    return clamp01(Math.pow(n, curve));
  }

  function shape(raw, dt, fromAudio) {
    let bassTarget;
    let midTarget;
    let highTarget;
    if (fromAudio) {
      bassTarget = expand("bass", raw.bass, dt, 1.4);
      // Keep a little motion even in a sparse midrange, and let highs go dark.
      midTarget = 0.18 + 0.74 * expand("mids", raw.mids, dt, 0.9);
      highTarget = 0.04 + 0.96 * expand("highs", raw.highs, dt, 0.75);
    } else {
      bassTarget = raw.bass;
      midTarget = raw.mids;
      highTarget = raw.highs;
    }

    shockCooldown = Math.max(0, shockCooldown - dt);
    // Compare the live bass byte to a slightly lagged copy so only a real
    // rise — a kick, not the wobble of a sustained note — throws the burst.
    const lagTau = 0.11;
    const rawJump = raw.bass - lagBass;
    lagBass += (raw.bass - lagBass) * (1 - Math.exp(-dt / lagTau));
    if (fromAudio && shockCooldown <= 0 && raw.bass > 0.42 && rawJump > 0.055) {
      shock = clamp01(0.7 + rawJump * 1.8);
      shockRadius = 0.04;
      shockCooldown = 0.24;
    } else if (!fromAudio && shockCooldown <= 0 && bassTarget > 0.55 && bassTarget - prevBassTarget > 0.18) {
      shock = 1;
      shockRadius = 0.04;
      shockCooldown = 0.28;
    }
    prevBassTarget = bassTarget;
    prevRawBass = raw.bass;

    smooth.bass = follow(smooth.bass, bassTarget, dt, ATTACK.bass, RELEASE.bass);
    smooth.mids = follow(smooth.mids, midTarget, dt, ATTACK.mids, RELEASE.mids);
    smooth.highs = follow(smooth.highs, highTarget, dt, ATTACK.highs, RELEASE.highs);

    shock *= Math.exp(-dt / 0.24);
    if (shock > 0.03) {
      shockRadius = Math.min(2.2, shockRadius + dt * 1.65);
    } else {
      shockRadius = 0.05;
      shock = 0;
    }

    midPhase += dt * (0.04 + smooth.mids * 0.35);

    return {
      mode: fromAudio ? "audio" : hasFile ? "audio" : "demo",
      bass: smooth.bass,
      mids: smooth.mids,
      highs: smooth.highs,
      shock,
      shockRadius,
      midPhase,
      raw: {
        bass: raw.bass,
        mids: raw.mids,
        highs: raw.highs,
      },
      targets: {
        bass: bassTarget,
        mids: midTarget,
        highs: highTarget,
      },
      env: {
        bassPeak: peaks.bass,
        bassFloor: floors.bass,
        midPeak: peaks.mids,
        midFloor: floors.mids,
        highPeak: peaks.highs,
        highFloor: floors.highs,
      },
    };
  }

  function update(dt, time) {
    const safeDt = Math.min(0.05, Math.max(0.001, dt || 0.016));
    const playing = hasFile && !player.paused && analyser && ctx && ctx.state === "running";
    if (!hasFile) {
      return shape(demoTargets(time), safeDt, false);
    }
    if (playing) {
      analyser.getByteFrequencyData(freq);
      return shape(
        {
          bass: band(20, 150),
          mids: band(180, 2500),
          highs: band(5000, 16000),
        },
        safeDt,
        true,
      );
    }
    return shape({ bass: 0.02, mids: 0.08, highs: 0.04 }, safeDt, true);
  }

  function loadFile(file) {
    unlock();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    hasFile = true;
    fileName = file.name || "audio";
    resetDynamics();
    player.src = objectUrl;
    player.load();
    ensureGraph();
    return fileName;
  }

  function clearFile() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    hasFile = false;
    fileName = "";
    player.removeAttribute("src");
    player.load();
  }

  return {
    unlock,
    ensureGraph,
    update,
    loadFile,
    clearFile,
    get hasFile() {
      return hasFile;
    },
    get fileName() {
      return fileName;
    },
    get context() {
      return ctx;
    },
  };
}
