import { documentExpiration } from './vault.service';
import { LocalDocumentStorage } from './document-storage';
import { mkdir, writeFile } from 'node:fs/promises';
jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn(),
  rm: jest.fn(),
}));
describe('Document evidence boundaries', () => {
  it('treats dates as valid through expiration day and warns at exactly 30 days', () => {
    const today = new Date('2026-09-20T23:59:59Z');
    expect(documentExpiration(new Date('2026-09-20'), today)).toBe(
      'EXPIRING_SOON',
    );
    expect(documentExpiration(new Date('2026-09-19'), today)).toBe('EXPIRED');
    expect(documentExpiration(new Date('2026-10-20'), today)).toBe(
      'EXPIRING_SOON',
    );
    expect(documentExpiration(new Date('2026-10-21'), today)).toBe('VALID');
    expect(documentExpiration(null, today)).toBe('NO_EXPIRATION');
  });
  it('uses exclusive file creation and rejects path traversal before filesystem access', async () => {
    const storage = new LocalDocumentStorage();
    await expect(
      storage.put('../private.env', Buffer.from('x')),
    ).rejects.toThrow('Invalid document storage key');
    expect(mkdir).not.toHaveBeenCalled();
    await storage.put(
      'documents/00000000-0000-4000-8000-000000000001/v1.pdf',
      Buffer.from('evidence'),
    );
    expect(writeFile).toHaveBeenCalledWith(
      expect.any(String),
      Buffer.from('evidence'),
      { flag: 'wx', mode: 0o600 },
    );
  });
});
