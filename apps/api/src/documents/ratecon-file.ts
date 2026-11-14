import { BadRequestException } from '@nestjs/common';
export function rateconFile(bytes: Buffer, mime: string, name: string) {
  if (!bytes.length || bytes.length > 10 * 1024 * 1024)
    throw new BadRequestException(
      'Document must be nonempty and at most 10 MB.',
    );
  let extension: 'pdf' | 'png' | 'jpg';
  if (
    mime === 'application/pdf' &&
    /\.pdf$/i.test(name) &&
    bytes.subarray(0, 5).toString() === '%PDF-' &&
    bytes.subarray(-2048).includes(Buffer.from('%%EOF'))
  )
    extension = 'pdf';
  else if (
    mime === 'image/png' &&
    /\.png$/i.test(name) &&
    bytes.length > 32 &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.subarray(12, 16).toString() === 'IHDR'
  ) {
    dimensions(bytes.readUInt32BE(16), bytes.readUInt32BE(20));
    extension = 'png';
  } else if (
    mime === 'image/jpeg' &&
    /\.jpe?g$/i.test(name) &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes.at(-2) === 255 &&
    bytes.at(-1) === 217
  ) {
    let offset = 2,
      found = false;
    while (offset + 9 < bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 218 || marker === 217) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      const size = bytes.readUInt16BE(offset);
      if (size < 2 || offset + size > bytes.length) break;
      if ([192, 193, 194].includes(marker)) {
        dimensions(
          bytes.readUInt16BE(offset + 5),
          bytes.readUInt16BE(offset + 3),
        );
        found = true;
        break;
      }
      offset += size;
    }
    if (!found)
      throw new BadRequestException(
        'JPEG dimensions or encoding are unsupported.',
      );
    extension = 'jpg';
  } else
    throw new BadRequestException(
      'Upload a valid PDF, PNG or JPEG whose filename and file signature match.',
    );
  return extension;
}
function dimensions(width: number, height: number) {
  if (
    !width ||
    !height ||
    width > 10000 ||
    height > 10000 ||
    width * height > 20000000
  )
    throw new BadRequestException(
      'Image exceeds the 20 megapixel or 10,000 pixel dimension limit.',
    );
}
