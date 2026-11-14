import { BadRequestException } from '@nestjs/common';
import { PNG } from 'pngjs';
export function signaturePng(image: string): Buffer {
  try {
    if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(image))
      throw new Error();
    const bytes = Buffer.from(
      image.slice('data:image/png;base64,'.length),
      'base64',
    );
    if (
      bytes.length > 64 * 1024 ||
      bytes.length < 33 ||
      !bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      throw new Error();
    const width = bytes.readUInt32BE(16),
      height = bytes.readUInt32BE(20);
    if (!width || !height || width > 2048 || height > 2048) throw new Error();
    const png = PNG.sync.read(bytes, { checkCRC: true });
    let ink = 0;
    for (let i = 0; i < png.data.length; i += 4)
      if (
        png.data[i + 3] > 32 &&
        Math.min(png.data[i], png.data[i + 1], png.data[i + 2]) < 220
      )
        ink++;
    if (ink < 8) throw new Error();
    // Canonical PNG strips extraneous chunks; checksum covers the stored artifact.
    const result = PNG.sync.write(png);
    if (result.length > 64 * 1024) throw new Error();
    return result;
  } catch {
    throw new BadRequestException(
      'Draw a signature and send a valid PNG up to 64 KB and 2048 × 2048 pixels.',
    );
  }
}
