// Video Studio: capture multi-angle screenshots, synthesize rapid timelapses & reels,
// render transitions, and export video clips (WebM/MP4) or frame bundles.
import { has3D, snapshot3D, setOrbitCamera, getOrbitCamera, ensureBuilt } from "./view3d.js";
import { openModal } from "./ui.js";
import { t } from "./i18n.js";
import { getReadyMadeReels } from "./video_presets.js";

var activeStudioModal = null;
var activeAnimationId = null;

export class VideoStudio {
  constructor(options = {}) {
    this.frames = []; // array of { id, src, img, label, durationMs, type, meta }
    this.currentIndex = 0;
    this.isPlaying = false;
    this.playbackMode = options.playbackMode || "loop"; // "loop" | "pingpong" | "once"
    this.playDirection = 1; // 1 forward, -1 backward (for pingpong)
    this.fps = options.fps || 12; // default 12 FPS for rapid presentation
    this.speedMultiplier = options.speedMultiplier || 1.0;
    this.transition = options.transition || "crossfade"; // "cut" | "crossfade" | "wipe_left" | "wipe_right" | "zoom" | "flash"
    this.showHud = options.showHud !== false;
    this.titleText = options.titleText || "ModelForge Reel";
    this.lastFrameTime = 0;
    this.transitionProgress = 0; // 0..1
    this.onFrameChange = null;
    this.onStateChange = null;
    this.canvas = null;
    this.ctx = null;
    this.width = options.width || 1280;
    this.height = options.height || 720;
  }

  attachCanvas(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.width = canvas.width || 1280;
    this.height = canvas.height || 720;
    this.renderCurrent();
  }

  getFrameDuration() {
    return Math.max(16, (1000 / Math.max(1, this.fps)) / Math.max(0.1, this.speedMultiplier));
  }

  getTotalDurationMs() {
    return this.frames.reduce((sum, f) => sum + (f.durationMs || this.getFrameDuration()), 0);
  }

  addFrame(frameData) {
    const id = "frame_" + Math.random().toString(36).slice(2, 9);
    const frame = {
      id: frameData.id || id,
      src: frameData.src,
      img: null,
      label: frameData.label || `Shot ${this.frames.length + 1}`,
      durationMs: frameData.durationMs || null,
      type: frameData.type || "screenshot",
      meta: frameData.meta || {},
    };

    if (typeof Image !== "undefined") {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = frame.src;
      img.onload = () => {
        frame.img = img;
        if (this.frames[this.currentIndex] === frame && !this.isPlaying) {
          this.renderCurrent();
        }
      };
      frame.img = img;
    }

    this.frames.push(frame);
    if (this.onStateChange) this.onStateChange();
    return frame;
  }

  removeFrame(index) {
    if (index < 0 || index >= this.frames.length) return;
    this.frames.splice(index, 1);
    if (this.currentIndex >= this.frames.length) {
      this.currentIndex = Math.max(0, this.frames.length - 1);
    }
    this.renderCurrent();
    if (this.onStateChange) this.onStateChange();
  }

  moveFrame(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= this.frames.length) return;
    if (toIndex < 0 || toIndex >= this.frames.length) return;
    const [moved] = this.frames.splice(fromIndex, 1);
    this.frames.splice(toIndex, 0, moved);
    this.currentIndex = toIndex;
    this.renderCurrent();
    if (this.onStateChange) this.onStateChange();
  }

  duplicateFrame(index) {
    if (index < 0 || index >= this.frames.length) return;
    const orig = this.frames[index];
    this.addFrame({
      src: orig.src,
      label: orig.label + " (Copy)",
      durationMs: orig.durationMs,
      type: orig.type,
      meta: { ...orig.meta },
    });
  }

  clear() {
    this.frames = [];
    this.currentIndex = 0;
    this.pause();
    this.renderCurrent();
    if (this.onStateChange) this.onStateChange();
  }

  reverse() {
    this.frames.reverse();
    this.currentIndex = 0;
    this.renderCurrent();
    if (this.onStateChange) this.onStateChange();
  }

  play() {
    if (this.isPlaying || this.frames.length === 0) return;
    this.isPlaying = true;
    this.lastFrameTime = performance.now();
    this.transitionProgress = 0;
    if (this.onStateChange) this.onStateChange();
    this.tick(performance.now());
  }

  pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (activeAnimationId) {
      cancelAnimationFrame(activeAnimationId);
      activeAnimationId = null;
    }
    if (this.onStateChange) this.onStateChange();
  }

  togglePlay() {
    if (this.isPlaying) this.pause();
    else this.play();
  }

  goToFrame(index) {
    if (this.frames.length === 0) return;
    this.currentIndex = Math.max(0, Math.min(this.frames.length - 1, index));
    this.transitionProgress = 0;
    this.renderCurrent();
    if (this.onFrameChange) this.onFrameChange(this.currentIndex);
  }

  nextFrame() {
    if (this.frames.length === 0) return;
    if (this.playbackMode === "pingpong") {
      let next = this.currentIndex + this.playDirection;
      if (next >= this.frames.length) {
        this.playDirection = -1;
        next = Math.max(0, this.frames.length - 2);
      } else if (next < 0) {
        this.playDirection = 1;
        next = Math.min(this.frames.length - 1, 1);
      }
      this.goToFrame(next);
    } else {
      let next = this.currentIndex + 1;
      if (next >= this.frames.length) {
        if (this.playbackMode === "once") {
          this.pause();
          return;
        }
        next = 0;
      }
      this.goToFrame(next);
    }
  }

  prevFrame() {
    if (this.frames.length === 0) return;
    let prev = this.currentIndex - 1;
    if (prev < 0) {
      prev = this.frames.length - 1;
    }
    this.goToFrame(prev);
  }

  tick(timestamp) {
    if (!this.isPlaying) return;
    const elapsed = timestamp - this.lastFrameTime;
    const curFrame = this.frames[this.currentIndex];
    const duration = (curFrame && curFrame.durationMs) || this.getFrameDuration();

    if (elapsed >= duration) {
      this.lastFrameTime = timestamp;
      this.nextFrame();
    } else {
      const transWindow = Math.min(duration * 0.35, 200);
      if (elapsed > duration - transWindow) {
        this.transitionProgress = (elapsed - (duration - transWindow)) / transWindow;
      } else {
        this.transitionProgress = 0;
      }
      this.renderCurrent();
    }

    if (this.isPlaying) {
      activeAnimationId = requestAnimationFrame((t) => this.tick(t));
    }
  }

  renderCurrent(targetCtx = null, targetWidth = null, targetHeight = null) {
    const ctx = targetCtx || this.ctx;
    if (!ctx) return;
    const w = targetWidth || (this.canvas ? this.canvas.width : this.width);
    const h = targetHeight || (this.canvas ? this.canvas.height : this.height);

    ctx.save();
    ctx.fillStyle = "#0c1017";
    ctx.fillRect(0, 0, w, h);

    if (this.frames.length === 0) {
      ctx.fillStyle = "#4a5568";
      ctx.font = "600 16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(t("video_studio_no_frames"), w / 2, h / 2);
      ctx.restore();
      return;
    }

    const cur = this.frames[this.currentIndex];
    let nextIdx = (this.currentIndex + this.playDirection + this.frames.length) % this.frames.length;
    const next = this.frames[nextIdx];
    const prog = this.transitionProgress;

    if (cur && cur.img && cur.img.complete && cur.img.naturalWidth > 0) {
      this.drawFrameImage(ctx, cur.img, w, h, 1.0);
    }

    if (prog > 0 && next && next.img && next.img.complete && next.img.naturalWidth > 0 && this.transition !== "cut") {
      this.applyTransition(ctx, cur, next, prog, w, h);
    }

    if (this.showHud) {
      this.drawHud(ctx, cur, w, h);
    }

    ctx.restore();
  }

  drawFrameImage(ctx, img, w, h, alpha = 1.0, scale = 1.0, offsetX = 0, offsetY = 0) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    const imgRatio = img.naturalWidth / img.naturalHeight;
    const targetRatio = w / h;
    let dw, dh, dx, dy;

    if (imgRatio > targetRatio) {
      dw = w * scale;
      dh = (w / imgRatio) * scale;
      dx = (w - dw) / 2 + offsetX;
      dy = (h - dh) / 2 + offsetY;
    } else {
      dh = h * scale;
      dw = (h * imgRatio) * scale;
      dx = (w - dw) / 2 + offsetX;
      dy = (h - dh) / 2 + offsetY;
    }

    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();
  }

  applyTransition(ctx, cur, next, t, w, h) {
    ctx.save();
    switch (this.transition) {
      case "crossfade":
        this.drawFrameImage(ctx, next.img, w, h, t);
        break;
      case "wipe_left":
        ctx.save();
        ctx.beginPath();
        ctx.rect(w * (1 - t), 0, w * t, h);
        ctx.clip();
        this.drawFrameImage(ctx, next.img, w, h, 1.0);
        ctx.restore();
        break;
      case "wipe_right":
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w * t, h);
        ctx.clip();
        this.drawFrameImage(ctx, next.img, w, h, 1.0);
        ctx.restore();
        break;
      case "zoom":
        this.drawFrameImage(ctx, cur.img, w, h, 1 - t, 1.0 + t * 0.08);
        this.drawFrameImage(ctx, next.img, w, h, t, 1.08 - (1 - t) * 0.08);
        break;
      case "flash":
        if (t < 0.5) {
          const flashAlpha = t * 2;
          ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha * 0.7})`;
          ctx.fillRect(0, 0, w, h);
        } else {
          this.drawFrameImage(ctx, next.img, w, h, 1.0);
          const fadeAlpha = (1 - t) * 2;
          ctx.fillStyle = `rgba(255, 255, 255, ${fadeAlpha * 0.7})`;
          ctx.fillRect(0, 0, w, h);
        }
        break;
      default:
        break;
    }
    ctx.restore();
  }

  drawHud(ctx, frame, w, h) {
    ctx.save();
    ctx.fillStyle = "rgba(10, 15, 25, 0.75)";
    ctx.beginPath();
    ctx.roundRect(16, 16, Math.min(320, w - 32), 38, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(59, 130, 246, 0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px Inter, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("ModelForge Reel", 28, 35);

    ctx.fillStyle = "#93c5fd";
    ctx.font = "600 11.5px Inter, system-ui, sans-serif";
    ctx.textAlign = "right";
    const labelX = Math.min(320, w - 32) + 4;
    ctx.fillText((frame && frame.label) || "", labelX, 35);

    const countText = `${this.currentIndex + 1} / ${this.frames.length}`;
    const curTimeMs = this.frames.slice(0, this.currentIndex).reduce((s, f) => s + (f.durationMs || this.getFrameDuration()), 0);
    const secs = (curTimeMs / 1000).toFixed(1);
    const badgeText = `REC ● [${countText}] · ${secs}s`;

    ctx.fillStyle = "rgba(10, 15, 25, 0.75)";
    ctx.beginPath();
    ctx.roundRect(16, h - 50, 180, 34, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(239, 68, 68, 0.5)";
    ctx.stroke();

    ctx.fillStyle = "#ef4444";
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "left";
    ctx.fillText("●", 26, h - 33);

    ctx.fillStyle = "#f3f4f6";
    ctx.font = "bold 12px monospace";
    ctx.fillText(badgeText.replace("REC ● ", ""), 40, h - 33);

    ctx.restore();
  }

  async exportVideo(onProgress = null) {
    if (this.frames.length === 0) throw new Error("No frames to export");
    this.pause();

    const expCanvas = document.createElement("canvas");
    expCanvas.width = 1280;
    expCanvas.height = 720;
    const expCtx = expCanvas.getContext("2d");

    let mimeType = "video/webm;codecs=vp9";
    if (typeof MediaRecorder !== "undefined") {
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "video/webm";
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = "video/mp4";
        }
      }
    }

    const stream = expCanvas.captureStream(Math.max(15, this.fps));
    const recorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : undefined,
      videoBitsPerSecond: 6000000,
    });

    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    const completionPromise = new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
        resolve(blob);
      };
    });

    recorder.start();

    const stepDuration = this.getFrameDuration();
    const subStepsPerFrame = Math.max(4, Math.round(stepDuration / 25));

    for (let i = 0; i < this.frames.length; i++) {
      this.currentIndex = i;
      for (let s = 0; s < subStepsPerFrame; s++) {
        const transProg = s >= subStepsPerFrame - 2 ? (s - (subStepsPerFrame - 2)) / 2 : 0;
        this.transitionProgress = transProg;
        this.renderCurrent(expCtx, 1280, 720);
        if (onProgress) {
          const totalProgress = ((i + s / subStepsPerFrame) / this.frames.length) * 100;
          onProgress(Math.round(totalProgress));
        }
        await new Promise((r) => setTimeout(r, 20));
      }
    }

    recorder.stop();
    const videoBlob = await completionPromise;

    const url = URL.createObjectURL(videoBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `modelforge_reel_${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);

    this.renderCurrent();
    return videoBlob;
  }
}

export async function captureOrbitTurntable(shotsCount = 16, studio = null) {
  if (!has3D) {
    const plan = document.getElementById("plan");
    if (plan && studio) {
      studio.addFrame({ src: plan.toDataURL("image/png"), label: "2D Plan Overview" });
    }
    return;
  }

  ensureBuilt();
  const initialCam = getOrbitCamera();
  const origTheta = (initialCam && initialCam.theta) || 0.92;
  const origPhi = (initialCam && initialCam.phi) || 0.95;
  const radius = (initialCam && initialCam.radius) || 800;

  for (let i = 0; i < shotsCount; i++) {
    const angle = origTheta + (i / shotsCount) * 2 * Math.PI;
    setOrbitCamera({ theta: angle, phi: origPhi, radius: radius });
    await new Promise((r) => setTimeout(r, 60));
    const dataUrl = await snapshot3D();
    if (dataUrl && studio) {
      const deg = Math.round(((i / shotsCount) * 360) % 360);
      studio.addFrame({
        src: dataUrl,
        label: `360° Orbit ${deg}°`,
        meta: { angleDeg: deg, theta: angle },
      });
    }
  }

  if (initialCam) setOrbitCamera(initialCam);
}

export async function captureMultiViewAngles(studio = null) {
  if (!studio) return;
  const initialCam = has3D ? getOrbitCamera() : null;

  const plan = document.getElementById("plan");
  if (plan) {
    studio.addFrame({ src: plan.toDataURL("image/png"), label: "Top Blueprint View" });
  }

  if (has3D) {
    ensureBuilt();
    const views = [
      { name: "Isometric 3D", theta: 0.92, phi: 0.95 },
      { name: "Front Elevation", theta: Math.PI / 2, phi: Math.PI / 2 },
      { name: "Right Elevation", theta: 0, phi: Math.PI / 2 },
      { name: "Rear Elevation", theta: -Math.PI / 2, phi: Math.PI / 2 },
      { name: "Left Elevation", theta: Math.PI, phi: Math.PI / 2 },
      { name: "Bird's Eye Perspective", theta: 0.92, phi: 0.3 },
    ];

    for (const v of views) {
      setOrbitCamera({ theta: v.theta, phi: v.phi, radius: initialCam ? initialCam.radius : 800 });
      await new Promise((r) => setTimeout(r, 60));
      const url = await snapshot3D();
      if (url) {
        studio.addFrame({ src: url, label: v.name });
      }
    }

    if (initialCam) setOrbitCamera(initialCam);
  }
}

export async function captureCurrentSnapshot(studio = null, customLabel = null) {
  if (!studio) return;
  if (has3D) {
    ensureBuilt();
    const url = await snapshot3D();
    if (url) {
      studio.addFrame({
        src: url,
        label: customLabel || `3D Snapshot (${studio.frames.length + 1})`,
      });
      return;
    }
  }

  const plan = document.getElementById("plan");
  if (plan) {
    studio.addFrame({
      src: plan.toDataURL("image/png"),
      label: customLabel || `Plan Snapshot (${studio.frames.length + 1})`,
    });
  }
}

export function openVideoStudio(options = {}) {
  if (activeStudioModal) {
    try { activeStudioModal.close(); } catch (_) {}
  }

  const m = openModal(t("video_studio_title"));
  activeStudioModal = m;
  m.overlay.querySelector(".bp-modal").classList.add("video-studio-modal");

  const studio = new VideoStudio(options);

  const desc = document.createElement("p");
  desc.className = "video-studio-desc";
  desc.textContent = t("video_studio_desc");
  m.body.appendChild(desc);

  const layout = document.createElement("div");
  layout.className = "video-studio-layout";

  const playerWrap = document.createElement("div");
  playerWrap.className = "video-studio-player-wrap";

  const canvas = document.createElement("canvas");
  canvas.className = "video-studio-canvas";
  canvas.width = 1280;
  canvas.height = 720;
  playerWrap.appendChild(canvas);
  studio.attachCanvas(canvas);

  const ctrlBar = document.createElement("div");
  ctrlBar.className = "video-studio-ctrl-bar";

  const playBtn = document.createElement("button");
  playBtn.type = "button";
  playBtn.className = "btn-accent video-studio-play-btn";
  playBtn.innerHTML = '<i class="ph ph-play"></i><span>' + t("video_studio_play") + "</span>";

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.innerHTML = '<i class="ph ph-skip-back"></i>';
  prevBtn.title = t("video_studio_prev_frame");

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.innerHTML = '<i class="ph ph-skip-forward"></i>';
  nextBtn.title = t("video_studio_next_frame");

  const scrubSlider = document.createElement("input");
  scrubSlider.type = "range";
  scrubSlider.className = "video-studio-scrub";
  scrubSlider.min = "0";
  scrubSlider.max = "0";
  scrubSlider.value = "0";

  const speedSelect = document.createElement("select");
  speedSelect.className = "video-studio-select";
  [
    ["0.5", "0.5x"],
    ["1", "1x"],
    ["1.5", "1.5x"],
    ["2", "2x"],
    ["4", "4x"],
    ["8", "8x"],
  ].forEach(([val, label]) => {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = label;
    if (val === "1") opt.selected = true;
    speedSelect.appendChild(opt);
  });

  const transSelect = document.createElement("select");
  transSelect.className = "video-studio-select";
  [
    ["crossfade", t("video_studio_trans_crossfade")],
    ["cut", t("video_studio_trans_cut")],
    ["wipe_left", t("video_studio_trans_wipe_left")],
    ["wipe_right", t("video_studio_trans_wipe_right")],
    ["zoom", t("video_studio_trans_zoom")],
    ["flash", t("video_studio_trans_flash")],
  ].forEach(([val, label]) => {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = label;
    transSelect.appendChild(opt);
  });

  const loopBtn = document.createElement("button");
  loopBtn.type = "button";
  loopBtn.className = "video-studio-toggle active";
  loopBtn.innerHTML = '<i class="ph ph-repeat"></i><span>' + t("video_studio_loop") + "</span>";

  ctrlBar.appendChild(playBtn);
  ctrlBar.appendChild(prevBtn);
  ctrlBar.appendChild(nextBtn);
  ctrlBar.appendChild(scrubSlider);
  ctrlBar.appendChild(speedSelect);
  ctrlBar.appendChild(transSelect);
  ctrlBar.appendChild(loopBtn);
  playerWrap.appendChild(ctrlBar);
  layout.appendChild(playerWrap);

  const sidePanel = document.createElement("div");
  sidePanel.className = "video-studio-side";

  const reelsBar = document.createElement("div");
  reelsBar.className = "video-studio-reels-bar";
  const readyReels = getReadyMadeReels();
  readyReels.forEach((r) => {
    const rBtn = document.createElement("button");
    rBtn.type = "button";
    rBtn.className = "video-studio-reel-chip";
    rBtn.innerHTML = `<i class="ph ${r.icon}"></i><span>${r.title}</span>`;
    rBtn.addEventListener("click", () => {
      studio.clear();
      r.frames.forEach((f) => studio.addFrame(f));
      studio.fps = r.fps || 12;
      studio.transition = r.transition || "crossfade";
      studio.play();
    });
    reelsBar.appendChild(rBtn);
  });
  sidePanel.appendChild(reelsBar);

  const presetsGroup = document.createElement("div");
  presetsGroup.className = "video-studio-presets";

  const btnOrbit16 = document.createElement("button");
  btnOrbit16.type = "button";
  btnOrbit16.innerHTML = '<i class="ph ph-arrows-clockwise"></i><span>' + t("video_studio_capture_orbit") + "</span>";

  const btnMultiView = document.createElement("button");
  btnMultiView.type = "button";
  btnMultiView.innerHTML = '<i class="ph ph-grid-four"></i><span>' + t("video_studio_capture_multiview") + "</span>";

  const btnSnap = document.createElement("button");
  btnSnap.type = "button";
  btnSnap.innerHTML = '<i class="ph ph-camera"></i><span>' + t("video_studio_capture_snapshot") + "</span>";

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*,video/*";
  fileInput.multiple = true;
  fileInput.style.display = "none";

  const btnUpload = document.createElement("button");
  btnUpload.type = "button";
  btnUpload.innerHTML = '<i class="ph ph-upload-simple"></i><span>' + t("video_studio_upload_media") + "</span>";
  btnUpload.addEventListener("click", () => fileInput.click());

  presetsGroup.appendChild(btnOrbit16);
  presetsGroup.appendChild(btnMultiView);
  presetsGroup.appendChild(btnSnap);
  presetsGroup.appendChild(btnUpload);
  presetsGroup.appendChild(fileInput);
  sidePanel.appendChild(presetsGroup);

  const timelineHeader = document.createElement("div");
  timelineHeader.className = "video-studio-timeline-head";
  timelineHeader.innerHTML = `<h4>${t("video_studio_frame_count")}: <span id="videoStudioFrameCount">0</span></h4>`;

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "video-studio-link-btn";
  clearBtn.textContent = t("video_studio_clear_all");
  clearBtn.addEventListener("click", () => studio.clear());

  const revBtn = document.createElement("button");
  revBtn.type = "button";
  revBtn.className = "video-studio-link-btn";
  revBtn.textContent = t("video_studio_reverse");
  revBtn.addEventListener("click", () => studio.reverse());

  timelineHeader.appendChild(revBtn);
  timelineHeader.appendChild(clearBtn);
  sidePanel.appendChild(timelineHeader);

  const timelineStrip = document.createElement("div");
  timelineStrip.className = "video-studio-timeline";
  sidePanel.appendChild(timelineStrip);

  layout.appendChild(sidePanel);
  m.body.appendChild(layout);

  const exportProgress = document.createElement("div");
  exportProgress.className = "video-studio-progress-wrap";
  exportProgress.hidden = true;
  exportProgress.innerHTML = '<div class="video-studio-progress-bar"><span></span></div><small></small>';

  const exportVideoBtn = document.createElement("button");
  exportVideoBtn.type = "button";
  exportVideoBtn.className = "btn-accent video-studio-export-btn";
  exportVideoBtn.innerHTML = '<i class="ph ph-film-strip"></i><span>' + t("video_studio_export_video") + "</span>";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = t("close");
  closeBtn.addEventListener("click", () => {
    studio.pause();
    m.close();
  });

  m.actions.appendChild(exportProgress);
  m.actions.appendChild(exportVideoBtn);
  m.actions.appendChild(closeBtn);

  function updateTimeline() {
    timelineStrip.innerHTML = "";
    const countEl = document.getElementById("videoStudioFrameCount");
    if (countEl) countEl.textContent = String(studio.frames.length);

    scrubSlider.max = String(Math.max(0, studio.frames.length - 1));
    scrubSlider.value = String(studio.currentIndex);

    playBtn.innerHTML = studio.isPlaying
      ? '<i class="ph ph-pause"></i><span>' + t("video_studio_pause") + "</span>"
      : '<i class="ph ph-play"></i><span>' + t("video_studio_play") + "</span>";

    studio.frames.forEach((frame, idx) => {
      const card = document.createElement("div");
      card.className = "video-studio-frame-card" + (idx === studio.currentIndex ? " active" : "");
      card.dataset.index = String(idx);

      const thumb = document.createElement("img");
      thumb.src = frame.src;
      thumb.alt = frame.label;

      const badge = document.createElement("span");
      badge.className = "video-studio-frame-badge";
      badge.textContent = `${idx + 1}`;

      const name = document.createElement("small");
      name.textContent = frame.label;

      const actions = document.createElement("div");
      actions.className = "video-studio-frame-actions";

      const leftBtn = document.createElement("button");
      leftBtn.innerHTML = '<i class="ph ph-caret-left"></i>';
      leftBtn.addEventListener("click", (e) => { e.stopPropagation(); studio.moveFrame(idx, idx - 1); });

      const rightBtn = document.createElement("button");
      rightBtn.innerHTML = '<i class="ph ph-caret-right"></i>';
      rightBtn.addEventListener("click", (e) => { e.stopPropagation(); studio.moveFrame(idx, idx + 1); });

      const delBtn = document.createElement("button");
      delBtn.innerHTML = '<i class="ph ph-trash"></i>';
      delBtn.addEventListener("click", (e) => { e.stopPropagation(); studio.removeFrame(idx); });

      actions.appendChild(leftBtn);
      actions.appendChild(rightBtn);
      actions.appendChild(delBtn);

      card.appendChild(thumb);
      card.appendChild(badge);
      card.appendChild(name);
      card.appendChild(actions);

      card.addEventListener("click", () => {
        studio.goToFrame(idx);
        updateTimeline();
      });

      timelineStrip.appendChild(card);
    });
  }

  studio.onFrameChange = (idx) => {
    scrubSlider.value = String(idx);
    const cards = timelineStrip.querySelectorAll(".video-studio-frame-card");
    cards.forEach((c, i) => c.classList.toggle("active", i === idx));
  };

  studio.onStateChange = () => {
    updateTimeline();
  };

  playBtn.addEventListener("click", () => studio.togglePlay());
  prevBtn.addEventListener("click", () => studio.prevFrame());
  nextBtn.addEventListener("click", () => studio.nextFrame());

  scrubSlider.addEventListener("input", function () {
    studio.goToFrame(parseInt(this.value, 10) || 0);
  });

  speedSelect.addEventListener("change", function () {
    studio.speedMultiplier = parseFloat(this.value) || 1.0;
  });

  transSelect.addEventListener("change", function () {
    studio.transition = this.value;
    studio.renderCurrent();
  });

  loopBtn.addEventListener("click", () => {
    if (studio.playbackMode === "loop") {
      studio.playbackMode = "pingpong";
      loopBtn.innerHTML = '<i class="ph ph-arrows-left-right"></i><span>' + t("video_studio_pingpong") + "</span>";
    } else if (studio.playbackMode === "pingpong") {
      studio.playbackMode = "once";
      loopBtn.innerHTML = '<i class="ph ph-arrow-right"></i><span>' + t("video_studio_play") + "</span>";
      loopBtn.classList.remove("active");
    } else {
      studio.playbackMode = "loop";
      loopBtn.innerHTML = '<i class="ph ph-repeat"></i><span>' + t("video_studio_loop") + "</span>";
      loopBtn.classList.add("active");
    }
  });

  btnOrbit16.addEventListener("click", async () => {
    btnOrbit16.disabled = true;
    exportProgress.hidden = false;
    exportProgress.querySelector("small").textContent = t("video_studio_capturing");
    exportProgress.querySelector(".video-studio-progress-bar span").style.width = "40%";
    try {
      await captureOrbitTurntable(16, studio);
    } finally {
      btnOrbit16.disabled = false;
      exportProgress.hidden = true;
      updateTimeline();
      studio.goToFrame(0);
      studio.play();
    }
  });

  btnMultiView.addEventListener("click", async () => {
    btnMultiView.disabled = true;
    try {
      await captureMultiViewAngles(studio);
    } finally {
      btnMultiView.disabled = false;
      updateTimeline();
      studio.goToFrame(0);
    }
  });

  btnSnap.addEventListener("click", async () => {
    await captureCurrentSnapshot(studio);
    updateTimeline();
  });

  fileInput.addEventListener("change", function () {
    const files = Array.from(this.files || []);
    files.forEach((f) => {
      if (f.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          studio.addFrame({ src: ev.target.result, label: f.name.replace(/\.[^/.]+$/, "") });
          updateTimeline();
        };
        reader.readAsDataURL(f);
      }
    });
    this.value = "";
  });

  exportVideoBtn.addEventListener("click", async () => {
    if (studio.frames.length === 0) return;
    exportVideoBtn.disabled = true;
    exportProgress.hidden = false;
    const bar = exportProgress.querySelector(".video-studio-progress-bar span");
    const lbl = exportProgress.querySelector("small");
    lbl.textContent = t("video_studio_recording");

    try {
      await studio.exportVideo((pct) => {
        bar.style.width = `${pct}%`;
        lbl.textContent = `${t("video_studio_recording")} ${pct}%`;
      });
    } catch (e) {
      console.error("Video export failed:", e);
    } finally {
      exportVideoBtn.disabled = false;
      exportProgress.hidden = true;
    }
  });

  m.onClose(() => {
    studio.pause();
    if (activeStudioModal === m) activeStudioModal = null;
  });

  if (Array.isArray(options.frames) && options.frames.length > 0) {
    options.frames.forEach((f) => studio.addFrame(f));
    updateTimeline();
  } else if (studio.frames.length === 0) {
    const defaultReels = getReadyMadeReels();
    if (defaultReels.length > 0 && defaultReels[0].frames && defaultReels[0].frames.length > 0) {
      defaultReels[0].frames.forEach((f) => studio.addFrame(f));
      updateTimeline();
    } else {
      captureCurrentSnapshot(studio).then(() => updateTimeline());
    }
  } else {
    updateTimeline();
  }

  return studio;
}

if (typeof window !== "undefined") {
  window.__openVideoStudio = openVideoStudio;
}

var launchStudio = typeof document !== "undefined" && document.getElementById("videoStudioBtn");
if (launchStudio) {
  launchStudio.addEventListener("click", function () { openVideoStudio(); });
}

