import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { constants } from 'node:fs';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';

export function documentStorageRoot(env = process.env, cwd = process.cwd()) {
  const configured = env.DOCUMENT_STORAGE_ROOT?.trim();
  if (!configured) {
    if (env.NODE_ENV === 'production')
      throw new Error(
        'DOCUMENT_STORAGE_ROOT must name an absolute private persistent directory in production.',
      );
    return resolve(cwd, 'storage', 'documents');
  }
  if (
    !isAbsolute(configured) ||
    resolve(configured) === parse(resolve(configured)).root
  )
    throw new Error(
      'DOCUMENT_STORAGE_ROOT must be an absolute directory below the filesystem root.',
    );
  return resolve(configured);
}

export abstract class DocumentStorage {
  abstract put(key: string, bytes: Buffer): Promise<void>;
  abstract read(key: string): Promise<Buffer>;
  abstract removeUncommitted(key: string): Promise<void>;
}
@Injectable()
export class LocalDocumentStorage
  extends DocumentStorage
  implements OnModuleInit
{
  private readonly root = documentStorageRoot();
  async onModuleInit() {
    try {
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      await access(this.root, constants.R_OK | constants.W_OK | constants.X_OK);
    } catch {
      // Do not dump filesystem errors or document paths into a public response.
      throw new Error(
        'Document storage is unavailable. Check the private volume mount and directory permissions.',
      );
    }
    if (process.env.NODE_ENV === 'production')
      new Logger(LocalDocumentStorage.name).log(
        `Private document storage ready: ${this.root}`,
      );
  }
  private path(key: string) {
    // Keys are generated internally. Legacy v1 names remain readable.
    if (
      !/^documents\/[0-9a-f-]{36}\/(?:v[1-9][0-9]*|[0-9a-f-]{36})\.(?:pdf|jpg|png)$/.test(
        key,
      )
    )
      throw new BadRequestException('Invalid document storage key.');
    // Database keys stay relative and unchanged; root is captured once at startup.
    return join(this.root, key.slice('documents/'.length));
  }
  async put(key: string, bytes: Buffer) {
    const target = this.path(key);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, bytes, { flag: 'wx', mode: 0o600 });
  }
  async read(key: string) {
    try {
      return await readFile(this.path(key));
    } catch {
      throw new NotFoundException('Stored document file was not found.');
    }
  }
  async removeUncommitted(key: string) {
    await rm(this.path(key), { force: true });
  }
}
