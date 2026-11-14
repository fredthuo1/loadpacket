// Local browser-test fixture only. No production accounts, keys or database.
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { managementFixture } from './management-fixture.mjs';
const secret = 'local-browser-test-signing-key-only';
let invitedPending = true;
let passwordSaved = false;
let savedPassword = '';
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const sign = data => createHmac('sha256', secret).update(data).digest('base64url');
const subject = role => `00000000-0000-4000-8000-${role === 'INVITED' ? '000000000003' : role === 'DRIVER' ? '000000000002' : '000000000001'}`;
const user = role => ({ id: subject(role), aud: 'authenticated', role: 'authenticated', email: `${role.toLowerCase()}@example.com`, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
const session = role => {
  const data = `${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:subject(role),iss:'http://127.0.0.1:3101/auth/v1',aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000),appRole:role})}`;
  return { access_token:`${data}.${sign(data)}`,refresh_token:`local-refresh-${role}`,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:user(role) };
};
const readRole = header => {
  const parts=(header||'').replace(/^Bearer /,'').split('.');
  if(parts.length!==3||sign(parts.slice(0,2).join('.'))!==parts[2])return null;
  const claims=JSON.parse(Buffer.from(parts[1],'base64url').toString());
  return claims.exp>Math.floor(Date.now()/1000)?claims.appRole:null;
};
createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:3100');
  res.setHeader('Access-Control-Allow-Headers','authorization,content-type,apikey,x-client-info,x-supabase-api-version');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,PUT,OPTIONS');
  res.setHeader('Content-Type','application/json');
  res.setHeader('X-Supabase-Api-Version','2024-01-01');
  res.setHeader('Access-Control-Expose-Headers','X-Supabase-Api-Version');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  const send=(code,data)=>{res.writeHead(code);res.end(JSON.stringify(data));};
  if(req.url==='/health')return send(200,{});
  if(req.url==='/auth/v1/verify') {
    let raw='';for await(const chunk of req)raw+=chunk;
    const body=JSON.parse(raw||'{}');
    if(body.token_hash!=='local-invite-hash') return send(403,{code:'otp_expired',msg:'Expired'});
    invitedPending=true; passwordSaved=false; savedPassword='';
    return send(200,session('INVITED'));
  }
  if(req.url.startsWith('/auth/v1/token')){
    let raw='';for await(const chunk of req)raw+=chunk;
    const body=JSON.parse(raw||'{}');
    if(body.password==='invalid')return send(400,{code:'invalid_credentials',msg:'Invalid login credentials'});
    const role=body.refresh_token?.replace('local-refresh-', '') || ({invited:'INVITED',driver:'DRIVER',dispatcher:'DISPATCHER',backoffice:'BACK_OFFICE'}[body.email?.split('@')[0]] ?? 'OWNER');
    return send(200,session(role));
  }
  const identity=readRole(req.headers.authorization);
  if(!identity)return send(401,{message:'Authentication required'});
  const role=identity==='INVITED'?'DRIVER':identity;
  if(req.url==='/auth/v1/user') {
    if(req.method==='PUT') {
      let raw='';for await(const chunk of req)raw+=chunk;
      const body=JSON.parse(raw||'{}');
      if(body.password==='weakpassword') return send(422,{code:'weak_password',msg:'Password should include a number.'});
      if(body.password===savedPassword)return send(422,{code:'same_password',msg:'New password should be different from the old password.'});
      savedPassword=body.password;
      passwordSaved=true;
    }
    return send(200,user(identity));
  }
  if(req.url.startsWith('/auth/v1/logout'))return send(200,{});
  if(req.url==='/api/v1/me')return send(200,{id:subject(identity),authUserId:subject(identity),organizationId:'local-org',role,onboardingRequired:identity==='INVITED'&&invitedPending,firstName:role==='DRIVER'?'Marcus':'Demo',lastName:role==='DRIVER'?'Reed':'Owner',email:user(identity).email,driver:role==='DRIVER'?{id:'local-driver',name:'Marcus Reed'}:null});
  if(req.url==='/api/v1/me/complete-invitation') { if(identity!=='INVITED'||!passwordSaved)return send(403,{message:'Set a password first.'}); invitedPending=false;return send(200,{accountStatus:'CONNECTED'}); }
  if(identity==='INVITED'&&invitedPending)return send(403,{message:'Complete invitation first.'});
  if(req.url==='/api/v1/me/loads')return send(200,{driver:{id:'local-driver',firstName:'Marcus',lastName:'Reed'},loads:[]});
  if(await managementFixture(req,send,role))return;
  if(req.url==='/api/v1/owner/dashboard')return send(200,{generatedAt:new Date().toISOString(),metrics:{totalLoads:0,totalLoadValue:'0.00',activeLoads:0,paymentReadyLoads:0,outstandingReceivables:{amount:'0.00',count:0},paidRevenue:{amount:'0.00',count:0},activeDrivers:1},recentLoads:[]});
  if(req.url==='/api/v1/autopilot/owner/exceptions')return send(200,{generatedAt:new Date().toISOString(),summary:{needsAttention:0,revenueNeedingAttention:'0.00',blockedByPaperwork:'0.00',moneyFound:'0.00'},exceptions:[]});
  return send(404,{message:'Fixture route not found'});
}).listen(3101,'127.0.0.1');
