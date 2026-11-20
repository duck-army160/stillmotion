const compressionModes = {
  detail: {redBits: 3, greenBits: 3, blueBits: 2, dither: 1},
  balanced: {redBits: 2, greenBits: 2, blueBits: 2, dither: .45},
  compact: {redBits: 2, greenBits: 1, blueBits: 1, dither: 0}
};

export class Gif {
  constructor(width, height, plays, transparent = false, compression = 'detail') {
    this.parts = [];
    this.byteLength = 0;
    this.width = width;
    this.height = height;
    this.transparent = transparent;
    const {redBits, greenBits, blueBits, dither} = compressionModes[compression];
    this.codeBits = redBits + greenBits + blueBits;
    this.redShift = greenBits + blueBits;
    this.greenShift = blueBits;
    this.redMax = (1 << redBits) - 1;
    this.greenMax = (1 << greenBits) - 1;
    this.blueMax = (1 << blueBits) - 1;
    this.dither = dither;
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
      0x2c, 0, 0, 0, 0, ...this.word(this.width), ...this.word(this.height), 0x80 | (this.codeBits - 1));
    const colors = 1 << this.codeBits;
    const palette = new Uint8Array(colors * 3);
    for (let i = 0; i < colors; i++) {
      palette[i * 3] = Math.round((i >> this.redShift) * 255 * brightness / this.redMax);
      palette[i * 3 + 1] = Math.round(((i >> this.greenShift) & this.greenMax) * 255 * brightness / this.greenMax);
      palette[i * 3 + 2] = Math.round((i & this.blueMax) * 255 * brightness / this.blueMax);
    }
    if (this.transparent) palette[5] = 0;
    this.append(palette);
    if (brightness === 0) {
      this.blackFrame ??= compress(new Uint8Array(this.width * this.height), this.codeBits);
    } else if (pixels !== this.previousPixels) {
      this.imageFrame = compress(quantize(pixels, this), this.codeBits);
      this.previousPixels = pixels;
    }
    const compressed = brightness === 0 ? this.blackFrame : this.imageFrame;
    this.add(this.codeBits);
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

function quantize(pixels, {width, transparent, redMax, greenMax, blueMax, redShift, greenShift, dither}) {
  const indices = new Uint8Array(pixels.length / 4);
  const pattern = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let i = 0; i < indices.length; i++) {
    const threshold = (pattern[(((i / width) | 0) & 3) * 4 + ((i % width) & 3)] + .5) / 16;
    const offset = .5 + (threshold - .5) * dither;
    const p = i * 4;
    if (transparent && pixels[p + 3] < 128) continue;
    const red = Math.floor(pixels[p] * redMax / 255 + offset);
    const green = Math.floor(pixels[p + 1] * greenMax / 255 + offset);
    const blue = Math.floor(pixels[p + 2] * blueMax / 255 + offset);
    const index = (red << redShift) | (green << greenShift) | blue;
    indices[i] = transparent && index < 2 ? index + 1 : index;
  }
  return indices;
}

function compress(indices, codeBits) {
  const output = new Uint8Array(indices.length * 2 + 8);
  const lookup = new Map();
  const clear = 1 << codeBits;
  const end = clear + 1;
  const firstCode = end + 1;
  let size = codeBits + 1;
  let next = firstCode;
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
  write(clear);
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
      write(clear);
      lookup.clear();
      size = codeBits + 1;
      next = firstCode;
    }
    prefix = suffix;
  }
  write(prefix);
  if (next === 1 << size && size < 12) size++;
  write(end);
  if (bits) output[position++] = pending;
  return output.slice(0, position);
}
