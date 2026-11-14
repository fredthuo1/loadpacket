import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, parse, resolve } from 'node:path';
import { Logger } from '@nestjs/common';
import { documentStorageRoot, LocalDocumentStorage } from './document-storage';

describe('private persistent filesystem storage', () => {
  let isolated: string;
  const originalRoot = process.env.DOCUMENT_STORAGE_ROOT;
  const originalMode = process.env.NODE_ENV;
  const key = 'documents/00000000-0000-4000-8000-000000000001/v1.pdf';
  beforeEach(async () => {
    isolated = await mkdtemp(join(tmpdir(), 'loadpacket-storage-test-'));
    process.env.DOCUMENT_STORAGE_ROOT = join(isolated, 'documents');
    process.env.NODE_ENV = 'test';
  });
  afterEach(async () => {
    if (originalRoot === undefined) delete process.env.DOCUMENT_STORAGE_ROOT;
    else process.env.DOCUMENT_STORAGE_ROOT = originalRoot;
    if (originalMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalMode;
    jest.restoreAllMocks();
    // Only the random directory created by this test is eligible for cleanup.
    if (dirnameSafe(isolated))
      await rm(isolated, { recursive: true, force: true });
  });
  const dirnameSafe = (folder: string) =>
    folder.startsWith(join(tmpdir(), 'loadpacket-storage-test-'));
  it('retains the development default and requires an explicit absolute production root', () => {
    expect(documentStorageRoot({}, isolated)).toBe(
      join(isolated, 'storage', 'documents'),
    );
    expect(
      documentStorageRoot(
        { DOCUMENT_STORAGE_ROOT: join(isolated, 'documents') },
        '/unused',
      ),
    ).toBe(join(isolated, 'documents'));
    for (const env of [
      { NODE_ENV: 'production' },
      { DOCUMENT_STORAGE_ROOT: 'relative/documents' },
      { DOCUMENT_STORAGE_ROOT: parse(resolve(isolated)).root },
    ])
      expect(() => documentStorageRoot(env)).toThrow('DOCUMENT_STORAGE_ROOT');
  });
  it('preserves immutable bytes across fresh production service instances without startup artifacts', async () => {
    process.env.NODE_ENV = 'production';
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const first = new LocalDocumentStorage();
    await first.onModuleInit();
    expect(await readdir(process.env.DOCUMENT_STORAGE_ROOT!)).toEqual([]);
    await first.put(key, Buffer.from('test evidence'));
    await expect(
      first.put(key, Buffer.from('overwrite')),
    ).rejects.toMatchObject({ code: 'EEXIST' });
    const restarted = new LocalDocumentStorage();
    await restarted.onModuleInit();
    expect(await restarted.read(key)).toEqual(Buffer.from('test evidence'));
    expect(await readFile(join(isolated, key))).toEqual(
      Buffer.from('test evidence'),
    );
    expect(await readdir(process.env.DOCUMENT_STORAGE_ROOT!)).toEqual([
      '00000000-0000-4000-8000-000000000001',
    ]);
  });
  it('rejects traversal and absolute keys for writes and cleanup', async () => {
    const storage = new LocalDocumentStorage();
    for (const bad of [
      '../outside.pdf',
      'documents/../outside.pdf',
      key.replaceAll('/', '\\'),
      join(isolated, 'outside.pdf'),
    ]) {
      await expect(storage.put(bad, Buffer.from('bad'))).rejects.toThrow(
        'Invalid document storage key',
      );
      await expect(storage.removeUncommitted(bad)).rejects.toThrow(
        'Invalid document storage key',
      );
      await expect(storage.read(bad)).rejects.toThrow(
        'Stored document file was not found',
      );
    }
  });
  it('fails startup safely when the configured directory cannot be created', async () => {
    await writeFile(join(isolated, 'documents'), 'test file blocks directory');
    await expect(new LocalDocumentStorage().onModuleInit()).rejects.toThrow(
      'Document storage is unavailable',
    );
  });
});
