// Browser fixtures exercise UI behavior; Nest authorization/constraints have separate HTTP/DB tests.
const timestamp = '2026-09-19T12:00:00.000Z';
let company = { id: 'local-org', name: 'Demo Carrier', dbaName: null, mcNumber: null, usdotNumber: null, email: null, phone: null, addressLine1: null, addressLine2: null, city: null, state: null, postalCode: null, country: 'US', timezone: 'America/Chicago', defaultPaymentTermsDays: 30, updatedAt: timestamp };
const load = { id: '00000000-0000-4000-8000-000000000010', loadNumber: 'D7A-ACTIVE', status: 'BOOKED', assignmentStatus: 'ASSIGNED', assignedAt: timestamp, origin: 'Chicago, IL', destination: 'Memphis, TN' };
const defaults = { email: null, phone: null, status: 'ACTIVE', accountConnected: false, accountStatus:'NOT_INVITED', invitationLastSentAt:null, currentLoad: null, recentLoads: [], totalLoadCount: 0, cdlNumber: null, cdlState: null, cdlExpirationDate: null, hireDate: null, notes: null, createdAt: timestamp, updatedAt: timestamp };
const drivers = [{ ...defaults, id: '22222222-2222-4222-8222-222222222222', firstName: 'Marcus', lastName: 'Reed', accountConnected: true, currentLoad: load, recentLoads: [load], totalLoadCount: 1 }];
let nextId = 100;
export async function managementFixture(req, send, role) {
  const path = req.url.split('?')[0];
  if (path !== '/api/v1/company' && !path.startsWith('/api/v1/drivers')) return false;
  const respond = (status, body) => { send(status, body); return true; };
  const companyRoute = path === '/api/v1/company';
  if (role === 'DRIVER' || (!companyRoute && role === 'BACK_OFFICE') || (companyRoute && req.method !== 'GET' && role !== 'OWNER')) return respond(403, { message: 'Access denied' });
  let input = {};
  if (req.method !== 'GET') { let raw = ''; for await (const chunk of req) raw += chunk; input = JSON.parse(raw || '{}'); }
  if (companyRoute) { if (req.method === 'PATCH') company = { ...company, ...input }; return respond(200, company); }
  const segments = path.slice('/api/v1/drivers'.length).split('/').filter(Boolean);
  if (!segments.length && req.method === 'GET') return respond(200, drivers);
  const duplicate = (email, except) => email && drivers.some(d => d.id !== except && d.status === 'ACTIVE' && d.email?.toLowerCase() === email.toLowerCase());
  if (!segments.length && req.method === 'POST') {
    if (duplicate(input.email)) return respond(409, { message: 'An active driver with this email already exists in your company.' });
    const driver = { ...defaults, ...input, id: `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}` }; drivers.push(driver); return respond(201, driver);
  }
  const driver = drivers.find(d => d.id === segments[0]);
  if (!driver) return respond(404, { message: 'Driver was not found.' });
  if(segments[1]==='invite') {
    if(role!=='OWNER')return respond(403,{message:'Access denied'});
    if(driver.status!=='ACTIVE'||!driver.email)return respond(409,{message:'Active driver and email required'});
    driver.accountStatus='INVITE_PENDING';driver.invitationLastSentAt=new Date().toISOString();
    return respond(200,{accountStatus:'INVITE_PENDING'});
  }
  if (segments[1] === 'deactivate') { if (driver.currentLoad) return respond(409, { message: `Marcus Reed cannot be deactivated while load ${driver.currentLoad.loadNumber} is active. Complete or reassign the load first.` }); driver.status = 'INACTIVE'; }
  if (segments[1] === 'activate') driver.status = 'ACTIVE';
  if (req.method === 'PATCH') { if (duplicate(input.email, driver.id)) return respond(409, { message: 'An active driver with this email already exists in your company.' }); Object.assign(driver, input); }
  return respond(200, driver);
}
