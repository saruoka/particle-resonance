import { createAudio } from "../../js/audio.js";
import { createFluid } from "./fluid.js";

const canvas = document.getElementById("view");
const ui = document.getElementById("ui");
const pickBtn = document.getElementById("pick");
const playBtn = document.getElementById("play");
const fullBtn = document.getElementById("full");
const fileInput = document.getElementById("file");
const player = document.getElementById("player");
const statusEl = document.getElementById("status");
const toastEl = document.getElementById("toast");
const fatalEl = document.getElementById("fatal");
const bars = {
  bass: document.getElementById("bar-bass"),
  mids: document.getElementById("bar-mid"),
  highs: document.getElementById("bar-high"),
};

const params = new URLSearchParams(location.search);
const capture = params.has("capture");

const state = {
  ready: false,
  frames: 0,
  mode: "demo",
  bass: 0,
  mids: 0,
  highs: 0,
  shock: 0,
  fps: 0,
  sim: null,
  simSize: 0,
  dyeSize: 0,
  mobile: false,
  dpr: 1,
  adaptations: [],
  error: null,
  time: 0,
};
window.__resonance = state;

function showFatal(message) {
  fatalEl.hidden = false;
  fatalEl.innerHTML = `<p>${message}</p>`;
}

const fluid = createFluid(canvas, { capture });

if (!fluid.ok) {
  state.error = String(fluid.error && fluid.error.message ? fluid.error.message : fluid.error);
  showFatal("このブラウザでは描画を開始できませんでした。Safari を更新して、もう一度開いてください。");
} else {
  state.sim = fluid.sim;
  state.simSize = fluid.simSize;
  state.dyeSize = fluid.dyeSize;
  state.mobile = fluid.mobile;
  state.dpr = fluid.dpr;
  boot();
}

function boot() {
  const audio = createAudio(player);
  let hideTimer = 0;
  let blockClicks = false;
  let fallbackImmersive = false;
  let toastTimer = 0;
  let last = performance.now();
  let warmed = 0;
  let fpsFrames = 0;
  let fpsElapsed = 0;
  let dprCap = fluid.mobile ? 1.5 : 2;
  let pressure = fluid.pressureIterations;

  const reveal = () => {
    ui.classList.remove("is-hidden");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => ui.classList.add("is-hidden"), 4200);
  };

  const toast = (message) => {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2800);
  };

  const shortName = (name) => {
    if (!name) return "音声";
    if (name.length <= 28) return name;
    return `${name.slice(0, 16)}…${name.slice(-8)}`;
  };

  const syncPlay = () => {
    const playing = audio.hasFile && !player.paused;
    playBtn.textContent = playing ? "一時停止" : "再生";
    playBtn.setAttribute("aria-pressed", playing ? "true" : "false");
    if (!audio.hasFile) {
      statusEl.textContent = "デモ";
      return;
    }
    const name = shortName(audio.fileName);
    if (player.ended) statusEl.textContent = `再生が終わりました · ${name}`;
    else if (playing) statusEl.textContent = `再生中 · ${name}`;
    else statusEl.textContent = `一時停止 · ${name}`;
  };

  const syncFull = () => {
    const active = !!(document.fullscreenElement || document.webkitFullscreenElement || fallbackImmersive);
    fullBtn.textContent = active ? "全画面解除" : "全画面";
    fullBtn.setAttribute("aria-pressed", active ? "true" : "false");
  };

  document.addEventListener("pointerdown", () => {
    audio.unlock();
    if (ui.classList.contains("is-hidden")) {
      blockClicks = true;
      reveal();
      setTimeout(() => {
        blockClicks = false;
      }, 380);
    } else {
      reveal();
    }
  });

  document.addEventListener("pointermove", (event) => {
    if (event.pointerType === "mouse") reveal();
  });

  pickBtn.addEventListener("click", () => {
    if (blockClicks) return;
    audio.unlock();
    fileInput.value = "";
    fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const type = file.type || "";
    const named = /\.(mp3|m4a|aac|wav|flac|ogg|aiff|aif|caf|mp4|webm)$/i.test(file.name || "");
    const typed = type.startsWith("audio/") || type === "video/mp4" || type === "application/ogg";
    if (type && !typed && !named) {
      toast("音声ファイルを選んでください");
      return;
    }
    try {
      audio.loadFile(file);
    } catch {
      toast("このファイルは読み込めませんでした");
      return;
    }
    playBtn.disabled = false;
    syncPlay();
    const playAttempt = player.play();
    if (playAttempt && typeof playAttempt.then === "function") {
      playAttempt.then(syncPlay).catch(() => {
        syncPlay();
        toast("再生を押してください");
      });
    }
  });

  async function togglePlay() {
    if (!audio.hasFile) {
      toast("先に音楽を選択してください");
      return;
    }
    audio.unlock();
    audio.ensureGraph();
    if (player.paused) {
      try {
        await player.play();
      } catch {
        toast("再生できませんでした。もう一度お試しください");
      }
    } else {
      player.pause();
    }
    syncPlay();
  }

  playBtn.addEventListener("click", () => {
    if (blockClicks) return;
    togglePlay();
  });

  async function toggleFullscreen() {
    const root = document.documentElement;
    const active = document.fullscreenElement || document.webkitFullscreenElement;
    if (active) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) {
        try {
          await exit.call(document);
        } catch {
          /* stay as we are */
        }
      }
      syncFull();
      return;
    }
    const req = root.requestFullscreen || root.webkitRequestFullscreen;
    const enabled = document.fullscreenEnabled || document.webkitFullscreenEnabled;
    if (req && enabled) {
      try {
        await req.call(root);
        syncFull();
        return;
      } catch {
        /* iPhone Safari often rejects element fullscreen */
      }
    }
    fallbackImmersive = !fallbackImmersive;
    document.body.classList.toggle("is-immersive", fallbackImmersive);
    if (fallbackImmersive) {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => ui.classList.add("is-hidden"), 700);
      toast("画面をタップすると操作が戻ります");
    } else {
      reveal();
    }
    syncFull();
  }

  fullBtn.addEventListener("click", () => {
    if (blockClicks) return;
    toggleFullscreen();
  });

  document.addEventListener("fullscreenchange", syncFull);
  document.addEventListener("webkitfullscreenchange", syncFull);

  player.addEventListener("play", syncPlay);
  player.addEventListener("pause", syncPlay);
  player.addEventListener("ended", syncPlay);
  player.addEventListener("error", () => {
    toast("このファイルは再生できません");
    syncPlay();
  });

  window.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
      event.preventDefault();
      togglePlay();
    } else if (event.key === "f" || event.key === "F") {
      toggleFullscreen();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && audio.context && audio.context.state === "suspended" && !player.paused) {
      audio.context.resume().catch(() => {});
    }
  });
  window.addEventListener("pageshow", () => {
    if (audio.context && audio.context.state === "suspended" && !player.paused) {
      audio.context.resume().catch(() => {});
    }
  });

  ["gesturestart", "gesturechange"].forEach((name) => {
    document.addEventListener(name, (event) => event.preventDefault());
  });

  const onResize = () => fluid.resize();
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", () => setTimeout(onResize, 180));
  if (window.visualViewport) window.visualViewport.addEventListener("resize", onResize);

  reveal();

  const frame = (now) => {
    try {
      const rawDt = Math.max(0.001, (now - last) / 1000);
      last = now;
      const dt = Math.min(0.033, rawDt);
      warmed += dt;
      const time = now / 1000;
      const bands = audio.update(Math.min(0.08, rawDt), time);
      fluid.update(dt, time, bands);
      const b = Math.max(0, Math.min(1, bands.bass));
      const m = Math.max(0, Math.min(1, bands.mids));
      const h = Math.max(0, Math.min(1, bands.highs));
      bars.bass.style.transform = `scaleX(${b})`;
      bars.mids.style.transform = `scaleX(${m})`;
      bars.highs.style.transform = `scaleX(${h})`;

      state.mode = bands.mode;
      state.bass = bands.bass;
      state.mids = bands.mids;
      state.highs = bands.highs;
      state.shock = bands.shock;
      state.time = time;
      state.frames += 1;
      state.dpr = fluid.dpr;
      state.pressure = pressure;

      fpsFrames += 1;
      fpsElapsed += dt;
      if (fpsElapsed >= 1.25 && warmed > 2.5) {
        const fps = fpsFrames / fpsElapsed;
        state.fps = Math.round(fps * 10) / 10;
        if (fps < 50 && dprCap > 1.01) {
          dprCap = Math.max(1, Math.round((dprCap - 0.25) * 100) / 100);
          fluid.setDprCap(dprCap);
          state.adaptations.push({ kind: "dpr", dprCap, fps: state.fps });
        } else if (fps < 42 && pressure > 6) {
          pressure = Math.max(6, pressure - 2);
          fluid.setPressureIterations(pressure);
          state.adaptations.push({ kind: "pressure", pressure, fps: state.fps });
        }
        fpsFrames = 0;
        fpsElapsed = 0;
      }

      if (!state.ready && state.frames >= 2) state.ready = true;
    } catch (error) {
      state.error = String(error && error.message ? error.message : error);
      console.error(error);
      showFatal("描画中に問題が起きました。ページを読み込み直してください。");
      return;
    }
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}
