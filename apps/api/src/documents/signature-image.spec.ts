import { PNG } from 'pngjs';
import { signaturePng } from './signature-image';
describe('signature PNG validation', () => {
  const image = () => {
    const png = new PNG({ width: 30, height: 20 });
    png.data.fill(255);
    for (let i = 0; i < 20; i++) {
      png.data[i * 4] = 0;
      png.data[i * 4 + 1] = 0;
      png.data[i * 4 + 2] = 0;
    }
    return PNG.sync.write(png);
  };
  it('decodes and preserves visible ink as canonical PNG', () => {
    const result = signaturePng(
      'data:image/png;base64,' + image().toString('base64'),
    );
    expect(PNG.sync.read(result).width).toBe(30);
  });
  it.each(['', 'data:image/png;base64,AAAA', 'data:image/svg+xml;base64,AAAA'])(
    'rejects missing or malformed image',
    (input) => expect(() => signaturePng(input)).toThrow(),
  );
  it('rejects bad CRC, oversized dimensions, blank and excessive bytes', () => {
    const corrupt = image();
    corrupt[corrupt.length - 5] ^= 1;
    const huge = image();
    huge.writeUInt32BE(100000, 16);
    const blank = new PNG({ width: 30, height: 20 });
    blank.data.fill(255);
    for (const value of [
      corrupt,
      huge,
      PNG.sync.write(blank),
      Buffer.alloc(65537),
    ])
      expect(() =>
        signaturePng('data:image/png;base64,' + value.toString('base64')),
      ).toThrow();
  });
});
