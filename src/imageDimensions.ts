import { imageSize } from 'image-size';

export interface ImageDimensions {
  /** Encoded pixel dimensions, before an EXIF orientation transform. */
  width: number;
  height: number;
  orientation?: number;
  type: 'png' | 'jpeg' | 'gif' | 'webp';
}

interface OrientationTag {
  offset: number;
  littleEndian: boolean;
  value: number;
  pngChunk?: { start: number; end: number };
}

function orientationTags(bytes: Uint8Array, mime: string): OrientationTag[] {
  const tags: OrientationTag[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tiff = (start: number, end: number, pngChunk?: OrientationTag['pngChunk']) => {
    if (end - start < 8) return;
    const littleEndian = bytes[start] === 73 && bytes[start + 1] === 73;
    if (!littleEndian && !(bytes[start] === 77 && bytes[start + 1] === 77)) return;
    if (view.getUint16(start + 2, littleEndian) !== 42) return;
    const directory = start + view.getUint32(start + 4, littleEndian);
    if (directory < start + 8 || directory + 2 > end) return;
    const count = view.getUint16(directory, littleEndian);
    for (let index = 0; index < count; index++) {
      const entry = directory + 2 + index * 12;
      if (entry + 12 > end) break;
      if (
        view.getUint16(entry, littleEndian) !== 274 ||
        view.getUint16(entry + 2, littleEndian) !== 3 ||
        view.getUint32(entry + 4, littleEndian) !== 1
      )
        continue;
      const value = view.getUint16(entry + 8, littleEndian);
      if (value >= 1 && value <= 8) tags.push({ offset: entry + 8, littleEndian, value, pngChunk });
    }
  };
  const exif = (start: number, end: number, pngChunk?: OrientationTag['pngChunk']) => {
    if ([69, 120, 105, 102, 0, 0].every((byte, index) => bytes[start + index] === byte)) start += 6;
    tiff(start, end, pngChunk);
  };
  if (mime === 'jpeg' && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    for (let count = 0; count < 1024 && offset + 4 <= bytes.length; count++) {
      if (bytes[offset] !== 255) break;
      while (bytes[offset + 1] === 255) offset++;
      const marker = bytes[offset + 1];
      if (marker === 218 || marker === 217 || marker === undefined) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) {
        offset += 2;
        continue;
      }
      const length = bytes[offset + 2] * 256 + bytes[offset + 3];
      const end = offset + 2 + length;
      if (length < 2 || end > bytes.length) break;
      if (marker === 225) exif(offset + 4, end);
      offset = end;
    }
  } else if (mime === 'png' && bytes.length >= 8) {
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = view.getUint32(offset),
        end = offset + 8 + length;
      if (end + 4 > bytes.length) break;
      if (String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)) === 'eXIf')
        exif(offset + 8, end, { start: offset + 4, end });
      offset = end + 4;
    }
  } else if (mime === 'webp' && bytes.length >= 12) {
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const length = view.getUint32(offset + 4, true),
        end = offset + 8 + length;
      if (end > bytes.length) break;
      if (String.fromCharCode(...bytes.subarray(offset, offset + 4)) === 'EXIF')
        exif(offset + 8, end);
      offset = end + (length % 2);
    }
  }
  return tags;
}

function embeddedBytes(
  src: string,
): { bytes: Uint8Array; mime: ImageDimensions['type'] } | undefined {
  if (src.length > 28_000_000) return undefined;
  const match = /^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(src);
  if (!match) return undefined;
  const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
  const mime = match[1] as ImageDimensions['type'];
  const prefix = (values: number[], offset = 0) =>
    values.every((value, index) => bytes[index + offset] === value);
  if (
    (mime === 'png' && !prefix([137, 80, 78, 71, 13, 10, 26, 10])) ||
    (mime === 'jpeg' && !prefix([255, 216])) ||
    (mime === 'gif' && !(prefix([71, 73, 70, 56, 55, 97]) || prefix([71, 73, 70, 56, 57, 97]))) ||
    (mime === 'webp' && !(prefix([82, 73, 70, 70]) && prefix([87, 69, 66, 80], 8)))
  )
    return undefined;
  return { bytes, mime };
}

/** Keep JPEG measurement bounded even when an untrusted file has malformed segments. */
function jpegHeader(input: Uint8Array): Uint8Array | undefined {
  if (input[0] !== 0xff || input[1] !== 0xd8) return undefined;
  let offset = 2;
  for (let segments = 0; segments < 1024 && offset + 4 <= input.length; segments++) {
    if (input[offset] !== 0xff) return undefined;
    while (input[offset + 1] === 0xff) offset++;
    const marker = input[offset + 1];
    if (marker === 0xda || marker === 0xd9 || marker === undefined) return undefined;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = input[offset + 2] * 256 + input[offset + 3];
    const end = offset + 2 + length;
    if (length < 2 || end > input.length) return undefined;
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 8) return undefined;
      // The maintained reader needs only SOF. Do not let its slicing
      // loop repeatedly copy large ICC/XMP payloads or scan malformed bytes.
      const prefix = new Uint8Array([0xff, 0xe0, 0, 2]);
      const result = new Uint8Array(2 + prefix.length + end - offset);
      result.set([0xff, 0xd8]);
      result.set(prefix, 2);
      result.set(input.subarray(offset, end), 2 + prefix.length);
      return result;
    }
    offset = end;
  }
  return undefined;
}

/** Read embedded raster headers synchronously in Node or a browser; never fetch or decode pixels. */
export function readImageDimensions(src: string): ImageDimensions | undefined {
  try {
    const embedded = embeddedBytes(src);
    if (!embedded) return undefined;
    const { bytes, mime } = embedded;
    const input = mime === 'jpeg' ? jpegHeader(bytes) : bytes;
    if (!input) return undefined;
    const measured = imageSize(input);
    const type = measured.type === 'jpg' ? 'jpeg' : measured.type;
    if (
      type !== mime ||
      !Number.isSafeInteger(measured.width) ||
      !Number.isSafeInteger(measured.height) ||
      measured.width <= 0 ||
      measured.height <= 0
    )
      return undefined;
    const orientation = orientationTags(bytes, mime)[0]?.value;
    return {
      width: measured.width,
      height: measured.height,
      type: type as ImageDimensions['type'],
      ...(orientation !== undefined &&
      Number.isInteger(orientation) &&
      orientation >= 1 &&
      orientation <= 8
        ? { orientation }
        : {}),
    };
  } catch {
    return undefined;
  }
}

/** Pixel dimensions a browser uses for legacy from-image orientation. */
export function displayImageDimensions(src: string): ImageDimensions | undefined {
  const dimensions = readImageDimensions(src);
  return dimensions && dimensions.orientation && dimensions.orientation >= 5
    ? { ...dimensions, width: dimensions.height, height: dimensions.width }
    : dimensions;
}

const displaySources = new Map<string, string>();
let displayCacheCharacters = 0;
function rememberDisplaySource(source: string, display: string): string {
  const cost = source.length + (source === display ? 0 : display.length);
  if (cost > 8_000_000) return display;
  while (
    displaySources.size &&
    (displaySources.size >= 16 || displayCacheCharacters + cost > 8_000_000)
  ) {
    const [oldSource, oldDisplay] = displaySources.entries().next().value!;
    displaySources.delete(oldSource);
    displayCacheCharacters -= oldSource.length + (oldSource === oldDisplay ? 0 : oldDisplay.length);
  }
  displaySources.set(source, display);
  displayCacheCharacters += cost;
  return display;
}

/** Derived browser data only: neutralize EXIF orientation without decoding or changing image pixels. */
export function imageDisplaySource(src: string): string {
  const cached = displaySources.get(src);
  if (cached !== undefined) return cached;
  try {
    const embedded = embeddedBytes(src);
    if (!embedded) return src;
    const { bytes, mime } = embedded;
    const tags = orientationTags(bytes, mime).filter((tag) => tag.value !== 1);
    if (!tags.length) return rememberDisplaySource(src, src);
    const view = new DataView(bytes.buffer);
    for (const tag of tags) view.setUint16(tag.offset, 1, tag.littleEndian);
    for (const { pngChunk } of tags)
      if (pngChunk) {
        let crc = 0xffffffff;
        for (let index = pngChunk.start; index < pngChunk.end; index++) {
          crc ^= bytes[index];
          for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
        view.setUint32(pngChunk.end, (crc ^ 0xffffffff) >>> 0);
      }
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32768)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    return rememberDisplaySource(src, `data:image/${mime};base64,${btoa(binary)}`);
  } catch {
    return src;
  }
}
