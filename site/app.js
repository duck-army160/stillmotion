import {Gif} from './gif.js';
import {draw3D, is3D} from './motion.js';
import {drawMontage, montageFrames} from './montage.js';
import {drawCaption, fallbackCaptionFont, layoutCaption, loadCaptionFont} from './caption.js';

const $ = id => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const presets = {
  fade: ['◐', 'Black fade', 2.9],
  dissolve: ['◒', 'Fade in & out', 3],
  zoom: ['⊕', 'Slow zoom', 3],
  flicker: ['✦', 'Flicker', 2],
  spin: ['↻', '360 Spin', 1.95],
  cube: ['◇', 'Diag. Rotating Cube', 1.95],
  sphere: ['◎', 'Rotating Sphere', 1.95],
  montage: ['▤', 'Meme Montage', 9.2]
};
// Brightness measured relative to the final frame of the supplied GIF.
const referenceBrightness = [
  0, .03021, .06761, .10355, .13939, .16175, .21141, .24731, .28291, .31880,
  .35475, .39037, .42658, .46214, .49825, .53377, .57010, .60556, .64136, .67729,
  .71312, .74867, .78464, .82056, .85675, .89216, .92789, .96391, 1
];
let effect = 'fade';
let exportSize;
let caption = null;
let captionFont = fallbackCaptionFont;
let fontRequest = 0;
let exportFont;
const previewPicture = document.createElement('canvas').getContext('2d');
let source;
let sourceName = 'stillmotion';
let position = 0;
let started = performance.now();
let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
let busy = false;
let loadVersion = 0;

for (const [key, [symbol, label]] of Object.entries(presets)) {
  const button = document.createElement('button');
  button.innerHTML = `<span aria-hidden="true">${symbol}</span>${label}`;
  button.dataset.effect = key;
  button.onclick = () => selectEffect(key);
  $('effects').append(button);
}

function selectEffect(key) {
  effect = key;
  $('duration').step = is3D(key) ? 0.05 : 0.1;
  $('duration').min = key === 'montage' ? 2 : key === 'fade' ? 0.6 : 0.5;
  $('duration').max = key === 'montage' ? 12 : 8;
  $('duration').value = presets[key][2];
  canvas.classList.toggle('transparent', is3D(key));
  $('presetBadge').textContent = presets[key][1];
  for (const button of $('effects').children) {
    button.setAttribute('aria-pressed', button.dataset.effect === key);
  }
  refresh(true);
}

function timeTotal() {
  return Math.round(Number($('duration').value) * 100);
}

function timeline() {
  const total = timeTotal();
  const frames = [];
  const spatial = is3D(effect);
  const count = Math.max(1, Math.round(total * Number($('fps').value) / 100));
  const flicker = [1, 1, .6, 1, .25, .8, 1, 1, .85, 1, .55];
  let offset = 0;
  for (let i = 0; i < count; i++) {
    const end = Math.round((i + 1) * total / count);
    const p = offset / total;
    const timing = {delay: end - offset, end};
    let brightness = 1;
    let zoom = 1;
    if (effect === 'fade') {
      const sample = i * (referenceBrightness.length - 1) / Math.max(1, count - 1);
      const low = Math.floor(sample);
      const high = Math.ceil(sample);
      brightness = referenceBrightness[low] + (referenceBrightness[high] - referenceBrightness[low]) * (sample - low);
    }
    if (effect === 'dissolve') brightness = Math.min(1, p * 3.5, (1 - p) * 3.5);
    if (effect === 'zoom') zoom += .22 * Math.sin(Math.PI * p) ** 2;
    if (effect === 'flicker') brightness = flicker[Math.floor(offset / 7) % flicker.length];
    frames.push(effect === 'montage'
      ? {brightness, montage: true, scene: montageFrames[Math.floor(i * montageFrames.length / count)], ...timing}
      : {brightness, zoom, motion: spatial ? effect : null, phase: spatial ? i / count : 0, ...timing});
    offset = end;
  }
  return frames;
}

let frames;
function refresh(reset = false) {
  if (reset) {
    position = 0;
    started = performance.now();
  }
  frames = timeline();
  const total = timeTotal();
  $('durationValue').value = `${(total / 100).toFixed(total % 10 ? 2 : 1)} s`;
  if (source) {
    const w = source.naturalWidth;
    const h = source.naturalHeight;
    const limit = Number($('size').value) || 1920;
    const factor = Math.min(1, limit / Math.max(w, h));
    const spatial = is3D(effect);
    if (spatial) {
      const side = Number($('size').value) || Math.min(1920, Math.max(w, h));
      exportSize = {width: side, height: side};
    } else {
      exportSize = {width: Math.max(1, Math.round(w * factor)), height: Math.max(1, Math.round(h * factor))};
    }
    const previewScale = spatial ? Math.min(1, 640 / exportSize.width) : 1;
    canvas.width = Math.max(1, Math.round(exportSize.width * previewScale));
    canvas.height = Math.max(1, Math.round(exportSize.height * previewScale)) + captionHeight(canvas.width, caption);
    canvas.style.setProperty('--canvas-ratio', canvas.width / canvas.height);
    const height = exportSize.height + captionHeight(exportSize.width, caption);
    $('details').textContent = `${exportSize.width} × ${height} px · ${frames.length} frames`;
  }
  $('download').disabled = !source || busy;
  show();
}

function captionHeight(width, layout) {
  return layout ? Math.max(1, Math.round(width * layout.ratio)) : 0;
}

function drawPicture(target, picture, frame, applyBrightness) {
  if (frame.montage) {
    drawMontage(target, picture, frame.scene);
    return;
  }
  if (frame.motion) {
    draw3D(target, picture, frame.motion, frame.phase);
    return;
  }
  const {width, height} = target.canvas;
  const zoom = frame.zoom ?? 1;
  target.fillStyle = '#000';
  target.fillRect(0, 0, width, height);
  target.globalAlpha = applyBrightness ? frame.brightness : 1;
  if (target.globalAlpha) {
    target.drawImage(picture, (width - width * zoom) / 2,
      (height - height * zoom) / 2, width * zoom, height * zoom);
  }
  target.globalAlpha = 1;
}

function drawFrame(target, scratch, picture, frame, layout, preview) {
  if (!layout) {
    drawPicture(target, picture, frame, preview);
    return;
  }
  const {width, height} = target.canvas;
  const banner = captionHeight(width, layout);
  if (scratch.canvas.width !== width || scratch.canvas.height !== height - banner) {
    scratch.canvas.width = width;
    scratch.canvas.height = height - banner;
    scratch.imageSmoothingQuality = 'high';
  }
  drawPicture(scratch, picture, frame, true);
  target.clearRect(0, banner, width, height - banner);
  target.drawImage(scratch.canvas, 0, banner);
  drawCaption(target, layout, banner);
}

let previousFrame;
function show() {
  const total = timeTotal();
  const frame = frames.find(item => position < item.end) ?? frames.at(-1);
  if (source) drawFrame(ctx, previewPicture, source, frame, caption, true);
  previousFrame = frame;
  $('scrub').value = position / total * 1000;
  $('time').textContent = `${(position / 100).toFixed(2)} / ${(total / 100).toFixed(2)} s`;
}

function tick(now) {
  if (playing) {
    const total = timeTotal();
    const plays = Number($('loop').value);
    const elapsed = Math.max(0, (now - started) / 10);
    if (plays && elapsed >= plays * total) {
      position = total;
      setPlayback(false);
      show();
    } else {
      position = elapsed % total;
      const frame = frames.find(item => position < item.end);
      if (frame !== previousFrame) show();
    }
  }
  requestAnimationFrame(tick);
}

function setPlayback(value) {
  playing = value;
  if (playing) {
    if (position >= timeTotal()) position = 0;
    started = performance.now() - position * 10;
  }
  $('play').textContent = playing ? 'Ⅱ' : '▶';
  $('play').setAttribute('aria-label', playing ? 'Pause preview' : 'Play preview');
}

function status(message) {
  $('status').textContent = message;
  $('status').hidden = !message;
}

async function setImage(file) {
  const version = ++loadVersion;
  const url = file ? URL.createObjectURL(file) : 'sample.jpg';
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
    if (version !== loadVersion) return;
    source = image;
    sourceName = file ? file.name.replace(/\.[^.]+$/, '') || 'image' : 'stillmotion';
    $('source').textContent = file?.name ?? 'Demo image';
    $('demo').hidden = !file;
    status('');
    refresh(true);
  } catch {
    if (version === loadVersion) status(file ? 'This image could not be opened. Try PNG, JPG or WebP.' : 'Upload an image to start.');
  } finally {
    if (file) URL.revokeObjectURL(url);
  }
}

$('drop').onclick = () => $('file').click();
$('file').onchange = event => {
  if (event.target.files[0]) setImage(event.target.files[0]);
  event.target.value = '';
};
$('drop').ondragover = event => {
  event.preventDefault();
  $('drop').classList.add('over');
};
$('drop').ondragleave = () => $('drop').classList.remove('over');
$('drop').ondrop = event => {
  event.preventDefault();
  $('drop').classList.remove('over');
  if (event.dataTransfer.files[0]) setImage(event.dataTransfer.files[0]);
};
$('demo').onclick = () => setImage();
$('duration').oninput = () => refresh(true);
$('size').onchange = () => refresh();
$('loop').onchange = () => refresh(true);
$('fps').onchange = () => refresh();
$('maxSize').onchange = () => {
  $('exportLimitLabel').textContent = `GIF export · ${$('maxSize').value} MB max`;
};
$('play').onclick = () => setPlayback(!playing);
$('scrub').oninput = () => {
  setPlayback(false);
  position = Number($('scrub').value) / 1000 * timeTotal();
  show();
};
function refreshCaption() {
  caption = $('captionEnabled').checked ? layoutCaption(ctx, $('captionText').value, captionFont) : null;
  refresh();
}

$('captionEnabled').onchange = () => {
  $('captionFields').hidden = !$('captionEnabled').checked;
  refreshCaption();
};
$('captionText').oninput = refreshCaption;
$('captionFontButton').onclick = () => $('captionFontFile').click();
$('captionFontFile').onchange = async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  const request = ++fontRequest;
  try {
    const font = await loadCaptionFont(file, request);
    if (request !== fontRequest) {
      document.fonts.delete(font.font);
      return;
    }
    if (captionFont.font && captionFont.font !== exportFont) document.fonts.delete(captionFont.font);
    captionFont = font;
    $('captionFontStatus').textContent = file.name;
    refreshCaption();
  } catch {
    if (request === fontRequest) $('captionFontStatus').textContent = 'This font file couldn’t be opened.';
  }
};

if (typeof FontFace !== 'undefined' && document.fonts) {
  document.fonts.load(fallbackCaptionFont.face).then(() => {
    if (captionFont === fallbackCaptionFont && caption) refreshCaption();
  }).catch(() => {});
  loadCaptionFont().then(font => {
    if (fontRequest) {
      document.fonts.delete(font.font);
      return;
    }
    captionFont = font;
    if (caption) refreshCaption();
  }).catch(() => {});
}

async function encodeWithinLimit(picture, plannedFrames, {width, height}, plays, layout, maxSizeMb, compression) {
  const exportLimit = maxSizeMb * 1_000_000;
  const output = document.createElement('canvas');
  const target = output.getContext('2d', {willReadFrequently: true});
  const scratch = layout && document.createElement('canvas').getContext('2d');
  const originalLongEdge = Math.max(width, height);
  let longEdge = originalLongEdge;
  while (longEdge >= 1) {
    output.width = Math.max(1, Math.round(width * longEdge / originalLongEdge));
    output.height = Math.max(1, Math.round(height * longEdge / originalLongEdge)) + captionHeight(output.width, layout);
    target.imageSmoothingQuality = 'high';
    const gif = new Gif(output.width, output.height, plays, Boolean(plannedFrames[0].motion), compression);
    let previous;
    let pixels;
    let encoded = 0;
    for (const frame of plannedFrames) {
      if (!previous || previous.zoom !== frame.zoom || previous.phase !== frame.phase
          || previous.scene !== frame.scene || (layout && previous.brightness !== frame.brightness)) {
        drawFrame(target, scratch, picture, frame, layout, false);
        pixels = target.getImageData(0, 0, output.width, output.height).data;
      }
      gif.frame(pixels, frame.delay, layout ? 1 : frame.brightness);
      previous = frame;
      encoded++;
      if (gif.byteLength + 1 > exportLimit) break;
      if (encoded % 3 === 1) {
        status(`Encoding ${output.width} × ${output.height} · ${Math.round(encoded / plannedFrames.length * 100)}%`);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    if (encoded === plannedFrames.length && gif.byteLength + 1 <= exportLimit) {
      return {blob: gif.finish(), width: output.width, height: output.height};
    }
    // Estimate bytes for the full timeline, then back off the pixel count.
    const projectedBytes = gif.byteLength * plannedFrames.length / encoded;
    const scale = Math.min(.99, Math.sqrt(exportLimit / projectedBytes) * .98);
    longEdge = Math.min(longEdge - 1, Math.floor(longEdge * scale));
    status(`Resizing to fit ${maxSizeMb} MB…`);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw Error('Could not fit GIF within the export limit.');
}

$('download').onclick = async () => {
  if (busy || !source) return;
  busy = true;
  exportFont = caption?.font;
  $('download').disabled = true;
  const name = `${sourceName}-${effect}.gif`;
  const maxSizeMb = Number($('maxSize').value);
  try {
    const result = await encodeWithinLimit(source, frames, exportSize, Number($('loop').value), caption,
      maxSizeMb, $('compression').value);
    const {blob, width, height} = result;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    status(`Downloaded ${name} · ${width} × ${height} px · ${(blob.size / 1_000_000).toFixed(2)} MB`);
  } catch {
    status('GIF export failed. Try a smaller size.');
  } finally {
    if (exportFont && exportFont !== captionFont.font) document.fonts.delete(exportFont);
    exportFont = undefined;
    busy = false;
    $('download').disabled = !source;
  }
};

selectEffect('fade');
setPlayback(playing);
setImage();
requestAnimationFrame(tick);
