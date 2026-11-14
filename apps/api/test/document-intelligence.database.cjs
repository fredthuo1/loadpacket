const path=require('node:path'),fs=require('node:fs');
const url=new URL(process.env.DATABASE_URL||'postgresql://invalid/invalid');
if(process.env.RUN_INTELLIGENCE_TESTS!=='1'||url.hostname!=='127.0.0.1'||url.port!=='55439'||url.pathname!=='/loadpacket_finance_verified_test')throw Error('Verified isolated B3 test target required');
const evidence=path.resolve(__dirname,'../../../test-results/document-intelligence');fs.mkdirSync(evidence,{recursive:true});process.chdir(evidence);if(fs.existsSync('.env'))throw Error('No environment file allowed in test directory');
process.env.NODE_ENV='test';process.env.DOCUMENT_STORAGE_ROOT=path.join(evidence,'documents');
require('ts-node').register({project:path.resolve(__dirname,'../tsconfig.json'),experimentalResolver:true});require('./document-intelligence.database.ts');
