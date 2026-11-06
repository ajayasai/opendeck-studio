import { describe, expect, it } from 'vitest';
import { displayImageDimensions, imageDisplaySource, readImageDimensions } from './imageDimensions';
import { readFile } from 'node:fs/promises';

const uri = (mime: string, bytes: Uint8Array) =>
  `data:image/${mime};base64,${btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))}`;

function jpeg(width: number, height: number, orientation?: number): Uint8Array {
  const prefix =
    orientation === undefined
      ? new Uint8Array([0xff, 0xe0, 0, 2])
      : new Uint8Array([
          0xff,
          0xe1,
          0,
          34,
          69,
          120,
          105,
          102,
          0,
          0,
          73,
          73,
          42,
          0,
          8,
          0,
          0,
          0,
          1,
          0,
          18,
          1,
          3,
          0,
          1,
          0,
          0,
          0,
          orientation,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
        ]);
  const result = new Uint8Array(2 + prefix.length + 19);
  result.set([0xff, 0xd8]);
  result.set(prefix, 2);
  result.set(
    [
      0xff,
      0xc0,
      0,
      17,
      8,
      height >> 8,
      height & 255,
      width >> 8,
      width & 255,
      3,
      1,
      17,
      0,
      2,
      17,
      0,
      3,
      17,
      0,
    ],
    2 + prefix.length,
  );
  return result;
}

describe('embedded raster dimensions', () => {
  it('reads a real embedded PNG without creating a DOM image', () => {
    const src =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    expect(readImageDimensions(src)).toEqual({ width: 1, height: 1, type: 'png' });
  });

  it('reads GIF logical-screen and extended WebP canvas dimensions', () => {
    const gif = new Uint8Array([71, 73, 70, 56, 57, 97, 64, 1, 200, 0]);
    expect(readImageDimensions(uri('gif', gif))).toEqual({ width: 320, height: 200, type: 'gif' });
    const webp = new Uint8Array(30);
    webp.set([82, 73, 70, 70, 22, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 88, 10, 0, 0, 0]);
    webp.set([63, 1, 0, 199, 0, 0], 24);
    expect(readImageDimensions(uri('webp', webp))).toEqual({
      width: 320,
      height: 200,
      type: 'webp',
    });
  });

  it.each([undefined, 1, 2, 3, 4, 5, 6, 7, 8])(
    'retains encoded JPEG dimensions and separate EXIF orientation %s',
    (orientation) => {
      expect(readImageDimensions(uri('jpeg', jpeg(320, 200, orientation)))).toEqual({
        width: 320,
        height: 200,
        type: 'jpeg',
        ...(orientation === undefined ? {} : { orientation }),
      });
    },
  );

  it('rejects remote paths, unsupported content, mismatched MIME, empty and malformed headers', () => {
    for (const src of [
      'https://example.com/picture.png',
      'file:///picture.png',
      'data:image/svg+xml;base64,PHN2Zy8+',
      'data:image/png;base64,%%%%',
      'data:image/png;base64,',
      uri('png', jpeg(320, 200)),
      uri('jpeg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1])),
      uri('jpeg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 255, 255])),
      uri('jpeg', jpeg(0, 200)),
      uri('jpeg', jpeg(320, 0)),
    ])
      expect(readImageDimensions(src)).toBeUndefined();
  });

  it('does not scan a malformed JPEG body as repeated candidate markers', () => {
    const corrupt = new Uint8Array(100_000);
    corrupt.set([0xff, 0xd8, 0xff, 0xe0, 0, 2]);
    expect(readImageDimensions(uri('jpeg', corrupt))).toBeUndefined();
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    'neutralizes real independent JPEG EXIF%s for display while retaining source pixels',
    async (orientation) => {
      const bytes = await readFile(`tests/fixtures/picture-geometry-exif-${orientation}.jpg`);
      const src = uri('jpeg', bytes);
      const before = src;
      expect(readImageDimensions(src)).toEqual({
        width: 800,
        height: 400,
        type: 'jpeg',
        orientation,
      });
      expect(displayImageDimensions(src)).toMatchObject(
        orientation >= 5 ? { width: 400, height: 800 } : { width: 800, height: 400 },
      );
      const display = imageDisplaySource(src);
      expect(readImageDimensions(display)).toEqual({
        width: 800,
        height: 400,
        type: 'jpeg',
        orientation: 1,
      });
      expect(src).toBe(before);
      const decoded = Uint8Array.from(atob(display.split(',')[1]), (character) =>
        character.charCodeAt(0),
      );
      expect(decoded.length).toBe(bytes.length);
      expect(Array.from(decoded).filter((byte, index) => byte !== bytes[index])).toHaveLength(
        orientation === 1 ? 0 : 1,
      );
      expect(imageDisplaySource(display)).toBe(display);
    },
  );

  it('neutralizes PNG eXIf orientation and repairs the metadata chunk CRC without touching raster data', () => {
    const tiff = jpeg(320, 200, 6).slice(12, 38);
    const raster = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      ),
      (character) => character.charCodeAt(0),
    );
    const chunk = new Uint8Array(tiff.length + 12);
    const chunkView = new DataView(chunk.buffer);
    chunkView.setUint32(0, tiff.length);
    chunk.set([101, 88, 73, 102], 4);
    chunk.set(tiff, 8);
    const bytes = new Uint8Array(raster.length + chunk.length);
    const offset = raster.length - 12;
    bytes.set(raster.subarray(0, offset));
    bytes.set(chunk, offset);
    bytes.set(raster.subarray(offset), offset + chunk.length);
    const src = uri('png', bytes);
    expect(readImageDimensions(src)).toMatchObject({ width: 1, height: 1, orientation: 6 });
    const normalized = imageDisplaySource(src);
    expect(readImageDimensions(normalized)?.orientation).toBe(1);
    const output = Uint8Array.from(atob(normalized.split(',')[1]), (character) =>
      character.charCodeAt(0),
    );
    expect(output.subarray(0, offset)).toEqual(raster.subarray(0, offset));
    // Independent zlib.crc32 of eXIf + the orientation-1 TIFF payload.
    expect(new DataView(output.buffer).getUint32(offset + 8 + tiff.length)).toBe(0xbd8d1830);
  });

  it('neutralizes WebP EXIF while preserving its encoded canvas and metadata padding', () => {
    const tiff = jpeg(320, 200, 8).slice(12, 38);
    const bytes = new Uint8Array(30 + 8 + tiff.length);
    bytes.set([
      82,
      73,
      70,
      70,
      bytes.length - 8,
      0,
      0,
      0,
      87,
      69,
      66,
      80,
      86,
      80,
      56,
      88,
      10,
      0,
      0,
      0,
      8,
    ]);
    bytes.set([63, 1, 0, 199, 0, 0], 24);
    bytes.set([69, 88, 73, 70, tiff.length, 0, 0, 0], 30);
    bytes.set(tiff, 38);
    const src = uri('webp', bytes);
    expect(readImageDimensions(src)).toEqual({
      width: 320,
      height: 200,
      type: 'webp',
      orientation: 8,
    });
    expect(readImageDimensions(imageDisplaySource(src))).toEqual({
      width: 320,
      height: 200,
      type: 'webp',
      orientation: 1,
    });
    expect(readImageDimensions(src)?.orientation).toBe(8);
  });
});
