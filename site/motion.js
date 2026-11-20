const camera = Math.sqrt(3) / 2;
const turn = Math.PI * 2;
const textures = new WeakMap();
const renderBuffers = new WeakMap();

export function is3D(effect) {
  return effect === 'spin' || effect === 'cube' || effect === 'sphere';
}

function textureFor(picture, size) {
  const ratio = Math.min(1, size * 3 / Math.max(picture.naturalWidth, picture.naturalHeight));
  const width = Math.max(1, Math.round(picture.naturalWidth * ratio));
  const height = Math.max(1, Math.round(picture.naturalHeight * ratio));
  const cached = textures.get(picture);
  if (cached?.width === width && cached.height === height) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(picture, 0, 0, width, height);
  const texture = ctx.getImageData(0, 0, width, height);
  textures.set(picture, texture);
  return texture;
}

function bufferFor(ctx) {
  const size = ctx.canvas.width;
  let buffer = renderBuffers.get(ctx);
  if (buffer?.pixels.width !== size) {
    const positions = Float64Array.from({length: size}, (_, index) => (index + .5) / size - .5);
    buffer = {pixels: ctx.createImageData(size, size), positions};
    renderBuffers.set(ctx, buffer);
  }
  buffer.pixels.data.fill(0);
  return buffer;
}

function sample(texture, output, offset, u, v) {
  const x = u * (texture.width - 1);
  const y = v * (texture.height - 1);
  const left = Math.floor(x);
  const top = Math.floor(y);
  const right = Math.min(left + 1, texture.width - 1);
  const bottom = Math.min(top + 1, texture.height - 1);
  const dx = x - left;
  const dy = y - top;
  const a = (top * texture.width + left) * 4;
  const b = (top * texture.width + right) * 4;
  const c = (bottom * texture.width + left) * 4;
  const d = (bottom * texture.width + right) * 4;
  for (let channel = 0; channel < 4; channel++) {
    output[offset + channel] =
      (texture.data[a + channel] * (1 - dx) + texture.data[b + channel] * dx) * (1 - dy)
      + (texture.data[c + channel] * (1 - dx) + texture.data[d + channel] * dx) * dy;
  }
}

function renderSpin(buffer, texture, sin, cos) {
  const {positions, pixels} = buffer;
  const size = positions.length;
  const scale = .632 / Math.max(texture.width, texture.height);
  const width = texture.width * scale;
  const height = texture.height * scale;
  for (let col = 0; col < size; col++) {
    const x = positions[col];
    const distance = camera * cos / (camera * cos - x * sin);
    const planeX = (x * cos + camera * sin) * distance - camera * sin;
    const u = planeX / width + .5;
    if (!(distance > 0 && u >= 0 && u <= 1)) continue;
    for (let row = 0; row < size; row++) {
      const v = positions[row] * distance / height + .5;
      if (v >= 0 && v <= 1) sample(texture, pixels.data, (row * size + col) * 4, u, v);
    }
  }
}

function renderCube(buffer, texture, sin, cos) {
  const {positions, pixels} = buffer;
  const size = positions.length;
  const half = .25;
  // Undo the yaw, then the spin around the face axis, for each camera ray.
  const originX = -camera * sin * cos;
  const originY = camera * sin * sin;
  const originZ = camera * cos;
  for (let row = 0; row < size; row++) {
    const y = positions[row];
    for (let col = 0; col < size; col++) {
      const x = positions[col];
      const turnedX = x * cos + camera * sin;
      const rayX = (turnedX * cos + y * sin) || Number.MIN_VALUE;
      const rayY = (-turnedX * sin + y * cos) || Number.MIN_VALUE;
      const rayZ = (x * sin - camera * cos) || Number.MIN_VALUE;
      const xIn = ((rayX > 0 ? -half : half) - originX) / rayX;
      const yIn = ((rayY > 0 ? -half : half) - originY) / rayY;
      const zIn = ((rayZ > 0 ? -half : half) - originZ) / rayZ;
      const entry = Math.max(xIn, yIn, zIn);
      const exit = Math.min(((rayX > 0 ? half : -half) - originX) / rayX,
        ((rayY > 0 ? half : -half) - originY) / rayY,
        ((rayZ > 0 ? half : -half) - originZ) / rayZ);
      if (!(entry > 0 && entry <= exit)) continue;
      const hitX = (originX + rayX * entry) / (2 * half);
      const hitY = (originY + rayY * entry) / (2 * half);
      const hitZ = (originZ + rayZ * entry) / (2 * half);
      let u;
      let v;
      if (entry === xIn) {
        u = hitZ * Math.sign(rayX) + .5;
        v = hitY + .5;
      } else if (entry === yIn) {
        u = hitX + .5;
        v = -hitZ * Math.sign(rayY) + .5;
      } else {
        u = -hitX * Math.sign(rayZ) + .5;
        v = hitY + .5;
      }
      sample(texture, pixels.data, (row * size + col) * 4,
        Math.max(0, Math.min(1, u)), Math.max(0, Math.min(1, v)));
    }
  }
}

function sphereMap(positions) {
  const size = positions.length;
  const radius = .334;
  const radiusSquared = radius ** 2;
  const longitude = new Float32Array(size * size);
  const latitude = new Float32Array(size * size).fill(-1);
  for (let row = 0; row < size; row++) {
    const y = positions[row];
    for (let col = 0; col < size; col++) {
      const x = positions[col];
      const rayLengthSquared = x * x + y * y + camera * camera;
      const discriminant = camera ** 4 - rayLengthSquared * (camera ** 2 - radiusSquared);
      if (discriminant < 0) continue;
      const distance = (camera ** 2 - Math.sqrt(discriminant)) / rayLengthSquared;
      const index = row * size + col;
      longitude[index] = .5 + Math.atan2(x * distance, camera * (1 - distance)) / turn;
      latitude[index] = .5 + Math.asin(y * distance / radius) / Math.PI;
    }
  }
  return {longitude, latitude};
}

export function draw3D(ctx, picture, effect, phase) {
  const buffer = bufferFor(ctx);
  const texture = textureFor(picture, ctx.canvas.width);
  const angle = phase * turn;
  if (effect === 'sphere') {
    buffer.sphere ??= sphereMap(buffer.positions);
    const {longitude, latitude} = buffer.sphere;
    for (let index = 0; index < latitude.length; index++) {
      if (latitude[index] < 0) continue;
      const u = longitude[index] - phase;
      sample(texture, buffer.pixels.data, index * 4, u - Math.floor(u), latitude[index]);
    }
  } else if (effect === 'spin') {
    renderSpin(buffer, texture, Math.sin(angle), Math.cos(angle));
  } else {
    renderCube(buffer, texture, Math.sin(angle), Math.cos(angle));
  }
  ctx.putImageData(buffer.pixels, 0, 0);
}
