import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import "./style.css";

const app = document.querySelector("#app");

app.innerHTML = `
  <main class="shell">
    <section class="card">
      <div class="brand">
        <div class="logo">MKV</div>
        <div>
          <h1>MKV + AC3 Merger</h1>
          <p>Lossless browser-side muxing. Your media files are not uploaded.</p>
        </div>
      </div>

      <div class="privacy">
        <span class="dot"></span>
        <strong>Local processing</strong>
        <span>Files stay on this device. FFmpeg runs in WebAssembly.</span>
      </div>

      <div class="inputs">
        <label class="file-box" id="videoBox">
          <input id="videoInput" type="file" accept=".mkv,video/x-matroska" />
          <span class="file-icon">🎬</span>
          <span class="file-title">Select MKV video</span>
          <span class="file-name" id="videoName">No file selected</span>
        </label>

        <label class="plus">+</label>

        <label class="file-box" id="audioBox">
          <input id="audioInput" type="file" accept=".ac3,audio/ac3" />
          <span class="file-icon">🔊</span>
          <span class="file-title">Select AC3 audio</span>
          <span class="file-name" id="audioName">No file selected</span>
        </label>
      </div>

      <div class="options">
        <label class="check">
          <input id="keepSubtitles" type="checkbox" checked />
          <span>Keep subtitle tracks from the MKV</span>
        </label>
      </div>

      <div class="actions">
        <button id="mergeBtn" class="primary" disabled>Merge</button>
        <button id="clearBtn" class="secondary" type="button">Clear</button>
      </div>

      <div id="status" class="status hidden">
        <div class="status-head">
          <span id="statusTitle">Preparing…</span>
          <span id="statusPercent"></span>
        </div>
        <div class="progress"><div id="progressBar"></div></div>
        <div id="statusDetail" class="status-detail"></div>
      </div>

      <div id="result" class="result hidden">
        <div class="success">✓ Merge complete</div>
        <div id="resultInfo"></div>
        <a id="downloadBtn" class="download" href="#" download>Download MKV</a>
      </div>

      <details class="advanced">
        <summary>FFmpeg command</summary>
        <code id="command"></code>
      </details>

      <p class="note">
        This performs stream copying (<code>-c copy</code>), so the video and AC3 audio are
        not re-encoded. It is normally much faster than encoding and preserves quality.
      </p>
    </section>
  </main>
`;

const videoInput = document.querySelector("#videoInput");
const audioInput = document.querySelector("#audioInput");
const videoName = document.querySelector("#videoName");
const audioName = document.querySelector("#audioName");
const mergeBtn = document.querySelector("#mergeBtn");
const clearBtn = document.querySelector("#clearBtn");
const keepSubtitles = document.querySelector("#keepSubtitles");
const status = document.querySelector("#status");
const statusTitle = document.querySelector("#statusTitle");
const statusPercent = document.querySelector("#statusPercent");
const statusDetail = document.querySelector("#statusDetail");
const progressBar = document.querySelector("#progressBar");
const result = document.querySelector("#result");
const resultInfo = document.querySelector("#resultInfo");
const downloadBtn = document.querySelector("#downloadBtn");
const commandEl = document.querySelector("#command");

let ffmpeg = null;
let ffmpegLoaded = false;
let outputUrl = null;

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 2 : 0)} ${units[i]}`;
}

function baseName(name) {
  return name.replace(/\.[^.]+$/, "");
}

function updateReady() {
  const video = videoInput.files[0];
  const audio = audioInput.files[0];

  videoName.textContent = video ? `${video.name} · ${formatBytes(video.size)}` : "No file selected";
  audioName.textContent = audio ? `${audio.name} · ${formatBytes(audio.size)}` : "No file selected";

  mergeBtn.disabled = !(video && audio);
}

function setStatus(title, detail = "", percent = null) {
  status.classList.remove("hidden");
  statusTitle.textContent = title;
  statusDetail.textContent = detail;

  if (percent === null) {
    statusPercent.textContent = "";
    progressBar.classList.add("indeterminate");
  } else {
    progressBar.classList.remove("indeterminate");
    const p = Math.max(0, Math.min(100, percent));
    statusPercent.textContent = `${p.toFixed(0)}%`;
    progressBar.style.width = `${p}%`;
  }
}

function setCommand(video, audio) {
  const subtitleArgs = keepSubtitles.checked ? " -map 0:s?" : "";
  commandEl.textContent =
    `ffmpeg -i "${video.name}" -i "${audio.name}" ` +
    `-map 0:v:0 -map 1:a:0${subtitleArgs} -c copy -map_metadata 0 output.mkv`;
}

async function loadFFmpeg() {
  if (ffmpegLoaded) return;

  setStatus("Loading FFmpeg…", "The first run downloads the WebAssembly FFmpeg core. Media files are not uploaded.");

  ffmpeg = new FFmpeg();

  ffmpeg.on("log", ({ message }) => {
    statusDetail.textContent = message;
  });

  const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";

  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });

  ffmpegLoaded = true;
}

async function merge() {
  const video = videoInput.files[0];
  const audio = audioInput.files[0];

  if (!video || !audio) return;

  if (!video.name.toLowerCase().endsWith(".mkv")) {
    alert("Please select an MKV video file.");
    return;
  }

  if (!audio.name.toLowerCase().endsWith(".ac3")) {
    alert("Please select an AC3 audio file.");
    return;
  }

  mergeBtn.disabled = true;
  clearBtn.disabled = true;
  result.classList.add("hidden");
  if (outputUrl) {
    URL.revokeObjectURL(outputUrl);
    outputUrl = null;
  }

  setCommand(video, audio);

  const videoFile = "input.mkv";
  const audioFile = "audio.ac3";
  const outputFile = "merged.mkv";

  try {
    await loadFFmpeg();

    setStatus("Reading local files…", "Copying the selected files into FFmpeg's in-browser filesystem.", null);

    await ffmpeg.writeFile(videoFile, await fetchFile(video));
    await ffmpeg.writeFile(audioFile, await fetchFile(audio));

    const args = [
      "-i", videoFile,
      "-i", audioFile,
      "-map", "0:v:0",
      "-map", "1:a:0",
    ];

    if (keepSubtitles.checked) {
      args.push("-map", "0:s?");
    }

    args.push(
      "-map_metadata", "0",
      "-c", "copy",
      "-y",
      outputFile
    );

    setStatus("Merging…", "Stream-copying video and AC3 audio. No re-encoding.", null);

    await ffmpeg.exec(args);

    setStatus("Reading result…", "Preparing the local download file.", 100);

    const data = await ffmpeg.readFile(outputFile);
    const blob = new Blob([data.buffer], { type: "video/x-matroska" });
    outputUrl = URL.createObjectURL(blob);

    const outputName = `${baseName(video.name)}.mkv`;
    downloadBtn.href = outputUrl;
    downloadBtn.download = outputName;

    resultInfo.textContent = `${outputName} · ${formatBytes(blob.size)}`;
    result.classList.remove("hidden");
    setStatus("Done", "The merged MKV is ready. Nothing was uploaded.", 100);

    await safeDelete(videoFile);
    await safeDelete(audioFile);
    await safeDelete(outputFile);
  } catch (error) {
    console.error(error);
    setStatus("Merge failed", error?.message || String(error), null);
    alert(
      "The merge failed. Check that the MKV is valid and that the AC3 file is a valid AC-3 stream."
    );

    await safeDelete(videoFile);
    await safeDelete(audioFile);
    await safeDelete(outputFile);
  } finally {
    clearBtn.disabled = false;
    mergeBtn.disabled = false;
  }
}

async function safeDelete(name) {
  try {
    if (ffmpeg) await ffmpeg.deleteFile(name);
  } catch (_) {
    // File may not exist.
  }
}

function clearAll() {
  videoInput.value = "";
  audioInput.value = "";
  updateReady();
  result.classList.add("hidden");
  status.classList.add("hidden");
  commandEl.textContent = "";
  progressBar.style.width = "0%";

  if (outputUrl) {
    URL.revokeObjectURL(outputUrl);
    outputUrl = null;
  }
}

videoInput.addEventListener("change", updateReady);
audioInput.addEventListener("change", updateReady);
keepSubtitles.addEventListener("change", () => {
  const video = videoInput.files[0];
  const audio = audioInput.files[0];
  if (video && audio) setCommand(video, audio);
});
mergeBtn.addEventListener("click", merge);
clearBtn.addEventListener("click", clearAll);
