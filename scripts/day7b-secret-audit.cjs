// Read-only audit. Reports paths/counts, never matching secret values.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const requireApi = createRequire(path.resolve('apps/api/package.json'));
const env = requireApi('dotenv').parse(fs.readFileSync('apps/api/.env'));
const secret = env.SUPABASE_SECRET_KEY;
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding:'utf8', stdio:['ignore','pipe','ignore'] }).split('\0').filter(Boolean);
const findings = [];
const refs = [];
const documentationExamples = [];
const actualSecrets = [secret, env.DOCUMENT_DOWNLOAD_SECRET];
try { const db = new URL(env.DATABASE_URL); if(db.password) actualSecrets.push(decodeURIComponent(db.password)); } catch { /* Never print connection details. */ }
for(const file of files) {
  if(!fs.existsSync(file) || !/\.(?:[cm]?[jt]sx?|md|json|sql|prisma|ya?ml|toml|example|log|snap)$/.test(file) || file.includes('/generated/')) continue;
  const content = fs.readFileSync(file,'utf8');
  if(/SUPABASE_SECRET_KEY|service_role|sb_secret_/.test(content)) refs.push(file);
  const dbMatches = [...content.matchAll(/postgres(?:ql)?:\/\/[^\s:@]+:([^\s@]{6,})@/g)];
  const placeholdersOnly = dbMatches.length > 0 && dbMatches.every(match => /^(?:password|\[password\]|\[your-password\]|<password>|your_password|your-password|<your-password>|\[PASSWORD\])$/i.test(match[1]));
  if(placeholdersOnly) documentationExamples.push(file);
  if(actualSecrets.some(value => value && value.length >= 12 && content.includes(value)) || /sb_secret_[A-Za-z0-9_-]{24,}/.test(content) || (dbMatches.length && !placeholdersOnly)) findings.push(file);
}
let bundleFiles=0;
function scanBundle(directory) {
  if(!fs.existsSync(directory))return;
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})) {
    const target=path.join(directory,entry.name);
    if(entry.isDirectory())scanBundle(target);
    else if(/\.(js|map)$/.test(entry.name)) {
      bundleFiles++; const content=fs.readFileSync(target,'utf8');
      if(actualSecrets.some(value=>value&&value.length>=12&&content.includes(value)) || /sb_secret_[A-Za-z0-9_-]{24,}/.test(content)) findings.push(target);
    }
  }
}
scanBundle('apps/web/.next/static');
const webEnv=fs.existsSync('apps/web/.env.local')?requireApi('dotenv').parse(fs.readFileSync('apps/web/.env.local')):{};
if(Object.keys(webEnv).some(key=>/SECRET|SERVICE_ROLE/.test(key)))findings.push('apps/web/.env.local (prohibited variable name)');
console.log(JSON.stringify({apiAdminSecretConfigured:!!secret,webAppUrlConfigured:!!env.WEB_APP_URL,referenceFiles:refs,placeholderExampleFiles:documentationExamples,browserBundleFilesScanned:bundleFiles,secretFindings:[...new Set(findings)]},null,2));
if(findings.length)process.exitCode=1;
