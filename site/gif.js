export class Gif {
  constructor(width, height, plays, transparent = false) {
    this.parts = [];
    this.byteLength = 0;
    this.width = width;
    this.height = height;
    this.transparent = transparent;
    this.add(...new TextEncoder().encode('GIF89a'), ...this.word(width), ...this.word(height), transparent ? 0xf0 : 0x70, 0, 0);
    if (transparent) this.add(0, 0, 0, 0, 0, 0);
    if (plays !== 1) {
      this.add(0x21, 0xff, 11, ...new TextEncoder().encode('NETSCAPE2.0'), 3, 1, ...this.word(plays ? plays - 1 : 0), 0);
    }
  }

  word(value) {
    return [value & 255, (value >> 8) & 255];
  }

  add(...bytes) {
    this.append(Uint8Array.from(bytes));
  }

  append(bytes) {
    this.parts.push(bytes);
    this.byteLength += bytes.length;
  }

  frame(pixels, delay, brightness = 1) {
    this.add(0x21, 0xf9, 4, this.transparent ? 9 : 4, ...this.word(delay), 0, 0,
      0x2c, 0, 0, 0, 0, ...this.word(this.width), ...this.word(this.height), 0x87);
    const palette = new Uint8Array(768);
    for (let i = 0; i < 256; i++) {
      palette[i * 3] = Math.round((i >> 5) * 255 * brightness / 7);
      palette[i * 3 + 1] = Math.round(((i >> 2) & 7) * 255 * brightness / 7);
      palette[i * 3 + 2] = Math.round((i & 3) * 255 * brightness / 3);
    }
    if (this.transparent) palette[5] = 0;
    this.append(palette);
    if (brightness === 0) {
      this.blackFrame ??= compress(new Uint8Array(this.width * this.height));
    } else if (pixels !== this.previousPixels) {
      this.imageFrame = compress(quantize(pixels, this.width, this.transparent));
      this.previousPixels = pixels;
    }
    const compressed = brightness === 0 ? this.blackFrame : this.imageFrame;
    this.add(8);
    for (let offset = 0; offset < compressed.length; offset += 255) {
      const block = compressed.subarray(offset, offset + 255);
      this.add(block.length);
      this.append(block);
    }
    this.add(0);
  }

  finish() {
    this.add(0x3b);
    return new Blob(this.parts, {type: 'image/gif'});
  }
}

function quantize(pixels, width, transparent) {
  const indices = new Uint8Array(pixels.length / 4);
  const pattern = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let i = 0; i < indices.length; i++) {
    const dither = (pattern[(((i / width) | 0) & 3) * 4 + ((i % width) & 3)] + .5) / 16;
    const p = i * 4;
    if (transparent && pixels[p + 3] < 128) continue;
    const red = Math.floor(pixels[p] * 7 / 255 + dither);
    const green = Math.floor(pixels[p + 1] * 7 / 255 + dither);
    const blue = Math.floor(pixels[p + 2] * 3 / 255 + dither);
    const index = (red << 5) | (green << 2) | blue;
    indices[i] = transparent && index < 2 ? index + 1 : index;
  }
  return indices;
}

function compress(indices) {
  const output = new Uint8Array(indices.length * 2 + 8);
  const lookup = new Map();
  let size = 9;
  let next = 258;
  let position = 0;
  let bits = 0;
  let pending = 0;
  function write(code) {
    pending |= code << bits;
    bits += size;
    while (bits >= 8) {
      output[position++] = pending & 255;
      pending >>>= 8;
      bits -= 8;
    }
  }
  write(256);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const suffix = indices[i];
    const key = (prefix << 8) | suffix;
    const code = lookup.get(key);
    if (code !== undefined) {
      prefix = code;
      continue;
    }
    write(prefix);
    if (next < 4096) {
      if (next === 1 << size) size++;
      lookup.set(key, next++);
    } else {
      write(256);
      lookup.clear();
      size = 9;
      next = 258;
    }
    prefix = suffix;
  }
  write(prefix);
  if (next === 1 << size && size < 12) size++;
  write(257);
  if (bits) output[position++] = pending;
  return output.slice(0, position);
}
