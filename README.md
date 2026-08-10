# MKV + AC3 Browser Merger

A single-page website that muxes an MKV video with an external AC3 audio file **entirely in the browser**.

## What it does

- Select `video.mkv`
- Select `audio.ac3`
- Optionally preserve subtitle tracks from the MKV
- Click **Merge**
- Download the resulting `.mkv`
- Uses FFmpeg WebAssembly with `-c copy`, so video and AC3 are not re-encoded

## Privacy

The selected media files are processed locally by FFmpeg.wasm. They are not sent to an application backend.

The first time the page is used, the FFmpeg WebAssembly core is downloaded from jsDelivr. That is the FFmpeg program, not the user's media.

For a completely self-contained deployment with no CDN dependency, install the FFmpeg core package locally and change the `baseURL` in `src/main.js` to your own hosted core assets.

## Requirements

- Node.js 18+ recommended
- A modern browser
- Enough RAM for the input and output files

## Run locally

```bash
npm install
npm run dev
```

Then open the local URL shown by Vite.

## Production build

```bash
npm run build
npm run preview
```

The generated `dist/` directory can be deployed to a static host.

## Important limitation

This version uses the single-thread FFmpeg core, so it does not require `SharedArrayBuffer`/cross-origin isolation. Large files can still consume substantial browser memory because FFmpeg.wasm uses an in-browser virtual filesystem.

For your exact operation, this is muxing rather than encoding, so it should be substantially faster than a real video transcode.

## FFmpeg operation

The default operation is equivalent to:

```bash
ffmpeg -i input.mkv -i audio.ac3 \
  -map 0:v:0 -map 1:a:0 \
  -map 0:s? \
  -map_metadata 0 \
  -c copy -y merged.mkv
```

The subtitle mapping is omitted when the "Keep subtitle tracks" option is disabled.
