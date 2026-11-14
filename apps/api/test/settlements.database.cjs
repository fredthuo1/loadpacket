const path=require('node:path'); const fs=require('node:fs');
const target=new URL(process.env.DATABASE_URL||'postgresql://invalid/invalid');
if(process.env.RUN_SETTLEMENT_TESTS!=='1'||target.hostname!=='127.0.0.1'||target.port!=='55439'||target.pathname!=='/loadpacket_finance_verified_test')throw Error('Explicit isolated settlement test target required');
const evidence=path.resolve(__dirname,'../../../test-results/settlements');fs.mkdirSync(evidence,{recursive:true});process.chdir(evidence);
process.env.DOCUMENT_STORAGE_ROOT=path.join(evidence,'documents');process.env.NODE_ENV='test';
require('ts-node').register({project:path.resolve(__dirname,'../tsconfig.json'),experimentalResolver:true});
require('./settlements.database.ts');
