import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { rateconWorkerSource } from './ratecon-worker';
export type SourcePage = {
  page: number;
  text: string;
  method: 'PDF_TEXT' | 'LOCAL_OCR';
};
export type ProcessedText = {
  pages: SourcePage[];
  ocrPages: number;
  characters: number;
};
export abstract class RateConProcessor {
  abstract process(bytes: Buffer, mime: string): Promise<ProcessedText>;
}
@Injectable()
export class LocalRateConProcessor extends RateConProcessor {
  process(bytes: Buffer, mime: string): Promise<ProcessedText> {
    return new Promise((resolve, reject) => {
      const modules = {
        pdf: require.resolve('pdf-parse'),
        canvas: require.resolve('pdf-parse/worker'),
        ocr: require.resolve('tesseract.js'),
        lang: require.resolve('@tesseract.js-data/eng'),
        mime,
      };
      const child = spawn(
        process.execPath,
        [
          '--max-old-space-size=256',
          '-e',
          rateconWorkerSource,
          JSON.stringify(modules),
        ],
        {
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'ignore'],
          env: {
            SystemRoot: process.env.SystemRoot,
            TEMP: process.env.TEMP,
            TMP: process.env.TMP,
            PATH: process.env.PATH,
          },
        },
      );
      let output = '',
        finished = false;
      const fail = (code: string) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        child.kill('SIGKILL');
        reject(new Error(code));
      };
      const timer = setTimeout(() => fail('TIMEOUT'), 120000);
      child.on('error', () => fail('WORKER_UNAVAILABLE'));
      child.stdin.on('error', () => fail('WORKER_UNAVAILABLE'));
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        if (Buffer.byteLength(output) > 1048576) fail('OUTPUT_LIMIT');
      });
      child.on('close', (code) => {
        if (finished) return;
        try {
          if (code !== 0) throw Error();
          const result: unknown = JSON.parse(output);
          if (!result || typeof result !== 'object') throw Error();
          if ('error' in result) {
            fail(
              typeof result.error === 'string'
                ? result.error
                : 'PROCESSING_FAILED',
            );
            return;
          }
          if (
            !('pages' in result) ||
            !Array.isArray(result.pages) ||
            !result.pages.length ||
            result.pages.length > 10 ||
            !result.pages.every(
              (p: unknown, i: number) =>
                !!p &&
                typeof p === 'object' &&
                'page' in p &&
                p.page === i + 1 &&
                'text' in p &&
                typeof p.text === 'string' &&
                'method' in p &&
                ['PDF_TEXT', 'LOCAL_OCR'].includes(String(p.method)),
            )
          )
            throw Error();
          const pages = result.pages as SourcePage[];
          const characters = pages.reduce((sum, p) => sum + p.text.length, 0);
          if (
            characters > 100000 ||
            !pages.some((p) => p.text.trim()) ||
            !('characters' in result) ||
            result.characters !== characters ||
            !('ocrPages' in result) ||
            result.ocrPages !==
              pages.filter((p) => p.method === 'LOCAL_OCR').length
          )
            throw Error();
          finished = true;
          clearTimeout(timer);
          resolve(result as ProcessedText);
        } catch {
          fail('PROCESSING_FAILED');
        }
      });
      child.stdin.end(bytes);
    });
  }
}
