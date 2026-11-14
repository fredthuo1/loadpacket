const { spawn } = require('node:child_process');
const path = require('node:path');
const child = spawn(process.execPath, ['dist/src/main.js'], { cwd: path.resolve('apps/api'), env: { ...process.env, PORT: '3301' }, windowsHide: true, stdio: 'ignore' });
async function main() {
  try {
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      try { if ((await fetch('http://localhost:3301/api/v1/health')).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!ready) throw new Error('Compiled API did not become ready.');
    for (const [route, expected] of [['health',200],['health/database',200],['me',401],['me/loads',401],['owner/dashboard',401],['drivers',401],['back-office/accounts-receivable',401]]) {
      const response = await fetch(`http://localhost:3301/api/v1/${route}`);
      if (response.status !== expected) throw new Error(`${route}: expected ${expected}, got ${response.status}`);
      console.log(`${route}: ${response.status}`);
    }
    const cors = await fetch('http://localhost:3301/api/v1/me', { method:'OPTIONS', headers:{Origin:'http://localhost:3000','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'Authorization,Content-Type'} });
    if (cors.status !== 204 || cors.headers.get('access-control-allow-origin') !== 'http://localhost:3000' || !cors.headers.get('access-control-allow-headers')?.includes('Authorization')) throw new Error('CORS preflight failed');
    console.log('Authenticated CORS preflight: PASS');
  } finally { child.kill(); }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
