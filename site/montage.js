// Transforms are measured in the reference image area, without its caption.
const scenes = {
  2: ['quad', 37, -18, 287, 57, 370, 428],
  3: ['quad', 77, 39, 463, -85, 496, 376],
  4: ['quad', 32, 20, 461, -41, 450, 396],
  7: ['tiles', [.151, .602], .25, -.20],
  8: ['tiles', [.151, .602], .25, -.44],
  9: ['tiles', [.151, .602], .25, -.70],
  10: ['tiles', [0], .634, -.39],
  11: ['tiles', [0], .883, -.81],
  12: ['quad', 162, 67, 234, 122, 263, 352],
  13: ['quad', 148, 123, 274, 140, 292, 274],
  14: ['quad', 128, 128, 291, 118, 294, 282],
  17: ['quad', 169, -144, 220, 86, 329, 559],
  18: ['quad', 52, 31, 460, -52, 471, 384],
  19: ['quad', 19, 17, 454, -31, 448, 403],
  27: ['slide', -.58],
  28: ['slide', -.64],
  29: ['rect', .078, 0, 1],
  32: ['quad', 73, 40, 464, -83, 496, 374],
  35: ['shards', 0, 8, -19, 376, 11, 400, 414],
  36: ['shards', 1, 175, 32, 247, 116, 284, 378],
  37: ['shards', 2, 139, 105, 201, 147, 302, 307],
  39: ['rotate', .5, .5, 1.01, .57],
  40: ['inset', .49, .57, .49, -.17],
  41: ['inset', .49, .51, .22, -.19],
  45: ['rect', .302, .300, .396],
  46: ['rect', .350, .349, .300],
  47: ['rect', .746, .350, .300],
  48: ['rect', .141, .142, .721],
  50: ['tiles', [0, .599], .34, -.12],
  51: ['tiles', [.151, .602], .25, -.46],
  52: ['tiles', [.151, .602], .25, -.70],
  53: ['tiles', [0], .805, -.54],
  60: ['slide', -.44],
  61: ['slide', -.66],
  62: ['rect', .03, 0, 1],
  65: ['quad', 72, 39, 463, -83, 496, 375],
  68: ['shards', 0, 0, 0, 410, 0, 414, 414],
  69: ['shards', 1, 68, 21, 309, 65, 374, 377],
  70: ['shards', 2, 176, 65, 266, 117, 297, 351],
  71: ['shards', 3, 101, 64, 330, 50, 361, 342],
  72: ['rotate', .5, .5, 1.01, .57],
  73: ['inset', .51, .50, .70, .32],
  74: ['inset', .51, .51, .32, -.70],
  75: ['inset', .48, .56, .037, -.20],
  78: ['rect', .239, .236, .527],
  79: ['rect', .339, .338, .325],
  80: ['rect', .919, .339, .325],
  81: ['rect', .336, .337, .329],
  83: ['tiles', [.187], .818, -.64],
  84: ['tiles', [.151, .602], .25, -.23],
  85: ['tiles', [.151, .602], .25, -.47],
  86: ['tiles', [0, .91], .48, -.22],
  89: ['quad', 73, 40, 464, -83, 496, 374]
};

export const montageFrames = Array.from({length: 92}, (_, frame) => scenes[frame] ?? null);

export function drawMontage(ctx, image, scene) {
  const {width, height} = ctx.canvas;
  const rect = (x, y, w, h = w) => ctx.drawImage(image, x, y, w, h);
  const quad = (x0, y0, x1, y1, y2, y3) => {
    // A vertical strip approximates the perspective of a planar card.
    const strips = 64;
    const sourceWidth = image.naturalWidth;
    for (let i = 0; i < strips; i++) {
      const t = i / strips;
      const left = x0 + (x1 - x0) * t;
      const top = y0 + (y1 - y0) * t;
      const bottom = y3 + (y2 - y3) * t;
      const perspective = (t * (y3 - y0)) / ((1 - t) * (y2 - y1) + t * (y3 - y0));
      const next = (i + 1) / strips;
      const end = (next * (y3 - y0)) / ((1 - next) * (y2 - y1) + next * (y3 - y0));
      rectStrip(perspective, end, left, top, bottom, (x1 - x0) / strips);
    }

    function rectStrip(from, to, x, y, bottom, w) {
      ctx.drawImage(image, from * sourceWidth, 0, (to - from) * sourceWidth, image.naturalHeight,
        x / 410, y / 414, w / 410 + 1 / width, (bottom - y) / 414);
    }
  };
  const rotated = (x, y, scale, angle, inset = false) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    if (inset) {
      ctx.fillStyle = '#10101e';
      ctx.fillRect(-scale / 2, -scale * .64, scale, scale * 1.28);
    }
    rect(-scale / 2, -scale / 2, scale);
    ctx.restore();
  };

  ctx.save();
  ctx.scale(width, height);
  const type = scene?.[0];
  ctx.fillStyle = !type || type === 'inset' ? '#fff' : '#0f0e1e';
  ctx.fillRect(0, 0, 1, 1);
  if (!scene) {
    rect(0, 0, 1);
    ctx.restore();
    return;
  }
  const args = scene.slice(1);
  switch (type) {
    case 'quad': quad(...args); break;
    case 'rect': rect(...args); break;
    case 'tiles': {
      const [columns, scale, offset] = args;
      for (const x of columns) {
        for (let y = offset % scale; y < 1; y += scale) rect(x, y, scale);
      }
      break;
    }
    case 'slide': {
      const [offset] = args;
      rect(offset, 0, 1);
      rect(1 + offset, 0, 1);
      ctx.fillRect(1 + offset, 0, .009, 1);
      break;
    }
    case 'rotate': rotated(...args); break;
    case 'inset':
      rect(0, 0, 1);
      rotated(...args, true);
      break;
    case 'shards':
      quad(...args.slice(1));
      drawShards(ctx, image, args[0]);
      break;
  }
  ctx.restore();
}

function drawShards(ctx, image, stage) {
  for (let i = 0; i < 17; i++) {
    const angle = i * 2.39996;
    const radius = .22 + (i % 4) * .07 + stage * .04;
    const size = .035 + (i % 4) * .024;
    ctx.save();
    ctx.translate(.5 + Math.cos(angle) * radius, .5 + Math.sin(angle) * radius);
    ctx.rotate(angle + stage * .6);
    ctx.beginPath();
    ctx.moveTo(-size / 2, -size / 2);
    ctx.lineTo(size / 2, -size / 4);
    ctx.lineTo(size / 3, size / 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(image, image.naturalWidth * ((i * 3) % 7) / 9, image.naturalHeight * ((i * 5) % 7) / 9,
      image.naturalWidth / 4, image.naturalHeight / 4, -size / 2, -size / 2, size, size);
    ctx.restore();
  }
}
