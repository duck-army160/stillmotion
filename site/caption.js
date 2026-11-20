export const fallbackCaptionFont = {face: '900 100px "Lexend Caption", sans-serif', squeeze: .80};

export async function loadCaptionFont(file, id = 0) {
  const family = `Stillmotion Caption ${id}`;
  const source = file ? await file.arrayBuffer() : [
    'Futura-CondensedExtraBold', 'Futura Condensed Extra Bold',
    'Futura Condensed ExtraBold', 'FuturaPTCond-ExtraBold', 'FuturaPTCond-ExtraBlack',
    'Futura PT Condensed Extra Black', 'Futura Std Condensed Extra Bold'
  ].map(name => `local("${name}")`).join(', ');
  const font = await new FontFace(family, source).load();
  document.fonts.add(font);
  return {face: `100px "${family}", sans-serif`, squeeze: 1, font};
}

export function layoutCaption(ctx, text, style) {
  if (!text.trim()) return null;
  ctx.save();
  ctx.font = style.face;
  const maxWidth = 900 / style.squeeze;
  const lines = [];
  for (const paragraph of text.trim().split('\n')) {
    let line = '';
    for (const word of paragraph.trim().split(/\s+/)) {
      const joined = line ? `${line} ${word}` : word;
      if (ctx.measureText(joined).width <= maxWidth) {
        line = joined;
        continue;
      }
      if (line) lines.push(line);
      line = '';
      for (const character of word) {
        if (line && ctx.measureText(line + character).width > maxWidth) {
          lines.push(line);
          line = '';
        }
        line += character;
      }
    }
    lines.push(line);
  }
  ctx.restore();
  return {lines, ...style, ratio: .205 + (lines.length - 1) * .117};
}

export function drawCaption(ctx, caption, height) {
  const {width} = ctx.canvas;
  const scale = width / 1000;
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.translate(width / 2, height / 2);
  ctx.scale(scale * caption.squeeze, scale);
  ctx.font = caption.face;
  ctx.fillStyle = '#000';
  ctx.textAlign = 'center';
  const metrics = ctx.measureText('Ag');
  const baseline = (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2 + 4;
  for (const [index, line] of caption.lines.entries()) {
    ctx.fillText(line, 0, baseline + (index - (caption.lines.length - 1) / 2) * 117);
  }
  ctx.restore();
}
