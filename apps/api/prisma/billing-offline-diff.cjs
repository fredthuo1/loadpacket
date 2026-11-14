// Prisma 7.10 Windows CLI omits --datasource when no datasource is configured,
// and can exit 0 with no SQL. Its installed native engine accepts an explicit
// EMPTY object. Never replace this with a connection URL or datasource diff.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawn } = require('node:child_process');

if (process.platform !== 'win32')
  throw new Error('This verified helper is Windows-only.');
const [before, after, output] = process.argv.slice(2);
if (!before || !after || !output)
  throw new Error(
    'Usage: node billing-offline-diff.cjs before.prisma after.prisma output.sql',
  );
const scratchRoot = path.resolve(__dirname, '../../../test-results') + path.sep;
if (
  !path.resolve(output).startsWith(scratchRoot) ||
  path.extname(output) !== '.sql'
)
  throw new Error(
    'Write generated SQL only under ignored test-results; never overwrite reviewed migrations.',
  );
const prismaRequire = createRequire(require.resolve('prisma/package.json'));
const engine = path.join(
  path.dirname(prismaRequire.resolve('@prisma/engines/package.json')),
  'schema-engine-windows.exe',
);
const file = (p) => ({
  path: path.resolve(p),
  content: fs.readFileSync(p, 'utf8'),
});
const params = {
  from: { tag: 'schemaDatamodel', files: [file(before)] },
  to: { tag: 'schemaDatamodel', files: [file(after)] },
  script: true,
  exitCode: null,
  filters: { externalTables: [], externalEnums: [] },
};
const child = spawn(engine, ['--datasource', '{}'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
  // Explicit allowlist: no DATABASE_URL, provider credentials or dotenv loading.
  env: {
    SystemRoot: process.env.SystemRoot,
    PATH: process.env.PATH,
    TEMP: process.env.TEMP,
  },
});
let buffer = '',
  sql = '',
  complete = false;
const fail = (message) => {
  console.error(message);
  process.exitCode = 1;
  child.kill();
};
const timeout = setTimeout(() => fail('Offline schema diff timed out.'), 20000);
child.stdin.on('error', () => {});
child.stderr.on('data', () => {}); // Do not echo engine payloads or schema contents.
child.on('error', () => fail('Unable to start the installed schema engine.'));
child.stdout.on('data', (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      fail('Invalid schema-engine response.');
      return;
    }
    if (message.method === 'print') {
      sql += message.params.content;
      child.stdin.write(
        JSON.stringify({ jsonrpc: '2.0', id: message.id, result: {} }) + '\n',
      );
    } else if (message.id === 1) {
      if (message.error || !sql.trim()) {
        fail('Offline diff failed or produced no SQL.');
        return;
      }
      fs.writeFileSync(output, sql);
      complete = true;
      clearTimeout(timeout);
      child.kill();
      console.log('Schema-only SQL generated; no datasource URL supplied.');
    }
  }
});
child.on('close', () => {
  clearTimeout(timeout);
  if (!complete) {
    console.error('Offline diff did not complete.');
    process.exitCode = 1;
  }
});
child.stdin.write(
  JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'diff', params }) + '\n',
);
