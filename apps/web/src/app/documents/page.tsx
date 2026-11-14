"use client";
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useCurrentUser } from '@/components/auth-provider';
import { UiIcon } from '@/components/ui-icon';
import { ManagementPage, Panel, Feedback, buttonClass, secondaryClass, inputClass } from '@/components/management-ui';
import { apiFetch, apiError, API_BASE_URL } from '@/lib/api/api-fetch';
import { managementRequest, type DriverSummary } from '@/lib/api/management';
import type { VaultDocument, VaultVersion } from '../../../../../packages/api-contracts/vault';

const companyTypes=['W9','CERTIFICATE_OF_INSURANCE','OPERATING_AUTHORITY','PERMIT','OTHER'];
const driverTypes=['CDL','MEDICAL_CERTIFICATE','MVR','OTHER'];
const label=(value:string)=>value.replaceAll('_',' ');
export default function DocumentsPage() {
  const user=useCurrentUser();
  const [documents,setDocuments]=useState<VaultDocument[]>([]);
  const [drivers,setDrivers]=useState<DriverSummary[]>([]);
  const [context,setContext]=useState(user?.role==='DRIVER'?'DRIVER':'COMPANY');
  const [search,setSearch]=useState(''); const [type,setType]=useState('');
  const [status,setStatus]=useState(''); const [expiration,setExpiration]=useState('');
  const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);const [success,setSuccess]=useState<string|null>(null);
  const [replacement,setReplacement]=useState<VaultDocument|null>(null);
  const [history,setHistory]=useState<string|null>(null);
  const formRef=useRef<HTMLFormElement>(null);
  const uploadKey=useRef<string|null>(null);
  const owner=user?.role==='OWNER';
  async function load() {
    setDocuments(await managementRequest<VaultDocument[]>('/documents/vault'));
  }
  useEffect(()=>{
    let alive=true;
    Promise.all([managementRequest<VaultDocument[]>('/documents/vault'),owner?managementRequest<DriverSummary[]>('/drivers'):Promise.resolve([])])
      .then(([docs,roster])=>{if(alive){setDocuments(docs);setDrivers(roster);setLoading(false);const selected=docs.find(d=>d.id===new URLSearchParams(window.location.search).get('documentId'));if(selected){setContext(selected.context);setSearch(selected.versions[0]?.originalFileName??selected.type);setHistory(selected.id);}}})
      .catch(err=>{if(alive){setError(err instanceof Error?err.message:'Unable to load documents.');setLoading(false);}});
    return()=>{alive=false;};
  },[owner]);
  const filtered=documents.filter(doc=>doc.context===context&&(!type||doc.type===type)&&(!status||doc.status===status)&&(!expiration||doc.expiration===expiration)&&`${doc.ownerName} ${doc.versions[0]?.originalFileName??''} ${doc.type}`.toLowerCase().includes(search.toLowerCase()));
  async function upload(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(busy)return;
    const data=new FormData(event.currentTarget);
    const driverId=String(data.get('driverId')??'');data.delete('driverId');
    uploadKey.current??=crypto.randomUUID();data.set('uploadKey',uploadKey.current);
    if(replacement)data.delete('type');
    setBusy(true);setError(null);setSuccess(null);
    try {
      const path=replacement?`/documents/vault/${replacement.id}/versions`:context==='COMPANY'?'/company/documents':`/drivers/${driverId}/documents`;
      const response=await apiFetch(path,{method:'POST',body:data});
      if(!response.ok)throw new Error(await apiError(response));
      // Keep the same key if the response is lost; changing a field starts a new operation.
      await load(); uploadKey.current=null;formRef.current?.reset();setReplacement(null);
      setSuccess(replacement?'New version saved. Previous versions remain available.':'Document uploaded.');
    } catch(err){setError(err instanceof Error?err.message:'Upload failed. Retry the same file.');}
    finally{setBusy(false);}
  }
  async function download(document:VaultDocument,version:VaultVersion) {
    setError(null);setBusy(true);
    try {
      const grant=await managementRequest<{path:string}>(`/documents/vault/${document.id}/versions/${version.id}/download`,'POST',{});
      if(!grant.path.startsWith('/documents/vault-files/'))throw new Error('Invalid download destination.');
      const anchor=window.document.createElement('a');anchor.href=`${API_BASE_URL}${grant.path}`;anchor.rel='noreferrer';anchor.click();
    }catch(err){setError(err instanceof Error?err.message:'Download failed.');}finally{setBusy(false);}
  }
  return <ManagementPage title="Documents" description="Company records, driver documents and load paperwork with preserved version history.">
    <Feedback error={error} success={success}/>
    <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Document context">
      {(user?.role==='DRIVER'?['DRIVER']:owner?['COMPANY','DRIVER','LOAD']:['COMPANY','LOAD']).map(item=><button key={item} className={context===item?buttonClass:secondaryClass} aria-pressed={context===item} disabled={busy} onClick={()=>{setContext(item);setType('');setReplacement(null);uploadKey.current=null;}}>{item==='COMPANY'?'Company':item==='DRIVER'?'Drivers':'Loads'}</button>)}
    </div>
    <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label>Search documents<input className={inputClass} value={search} onChange={event=>setSearch(event.target.value)} placeholder="File or owner"/></label>
      <label>Document type<select className={inputClass} value={type} onChange={event=>setType(event.target.value)}><option value="">All types</option>{[...new Set(documents.filter(doc=>doc.context===context).map(doc=>doc.type))].map(item=><option key={item} value={item}>{label(item)}</option>)}</select></label>
      <label>Status<select className={inputClass} value={status} onChange={event=>setStatus(event.target.value)}><option value="">All statuses</option>{['UPLOADED','TEXT_EXTRACTED','REVIEW_REQUIRED','CONFIRMED'].map(item=><option key={item} value={item}>{label(item)}</option>)}</select></label>
      <label>Expiration<select className={inputClass} value={expiration} onChange={event=>setExpiration(event.target.value)}><option value="">All dates</option>{['VALID','EXPIRING_SOON','EXPIRED','NO_EXPIRATION'].map(item=><option key={item} value={item}>{label(item)}</option>)}</select></label>
    </div>
    {owner&&context!=='LOAD'&&<div className="mb-6"><Panel title={replacement?'Upload New Version':'Upload Document'}><form ref={formRef} onSubmit={upload} onChange={()=>{uploadKey.current=null;}}><fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
      {replacement?<p className="sm:col-span-2">Replacing {replacement.versions[0]?.originalFileName}. Original evidence will be retained.</p>:<>
        {context==='DRIVER'&&<label>Driver<select name="driverId" required className={inputClass} defaultValue=""><option value="" disabled>Select a driver</option>{drivers.map(driver=><option key={driver.id} value={driver.id}>{driver.firstName} {driver.lastName}{driver.status==='INACTIVE'?' (Inactive)':''}</option>)}</select></label>}
        <label>Upload type<select className={inputClass} name="type">{(context==='COMPANY'?companyTypes:driverTypes).map(item=><option key={item} value={item}>{label(item)}</option>)}</select></label>
      </>}
      <label>File (PDF, PNG, JPEG; maximum 10 MB)<input className={inputClass} name="file" type="file" accept="application/pdf,image/png,image/jpeg" required/></label>
      <label>Issued date<input className={inputClass} name="issuedAt" type="date"/></label>
      <label>Expiration date<input className={inputClass} name="expiresAt" type="date"/></label>
      <div className="flex flex-wrap gap-2 sm:col-span-2"><button className={buttonClass} disabled={busy}>{busy?'Working…':replacement?'Save New Version':'Upload Document'}</button>{replacement&&<button type="button" className={secondaryClass} onClick={()=>{setReplacement(null);uploadKey.current=null;}}>Cancel Replacement</button>}</div>
    </fieldset></form></Panel></div>}
    {context==='LOAD'&&<p className="mb-4 text-sm text-slate-600">Upload load paperwork through the assigned load workflow.</p>}
    {loading?<p role="status">Loading documents…</p>:filtered.length===0?<div className="flex items-start gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-5 text-slate-600"><UiIcon name="document" /><div><p className="font-semibold text-slate-900">No documents match these filters.</p><p className="mt-1 text-sm leading-6">Try another document group or adjust the search and filters.</p></div></div>:<div className="grid gap-4 md:grid-cols-2">{filtered.map(document=>{
      const current=document.versions[0];
      return <Panel key={document.id} title={label(document.type)}><p className="font-medium">{document.ownerName}</p><p className="mt-2 break-words">{current?.originalFileName??'No version available'}</p><p className="mt-2 text-sm">{label(document.status)} · {label(document.expiration)}</p>{current&&<p className="mt-2 text-sm text-slate-600">Version {current.versionNumber} · Uploaded {new Date(current.uploadedAt).toLocaleDateString()} by {current.uploadedBy??'Unknown (historical upload)'}{current.expiresAt?` · Expires ${current.expiresAt}`:''}</p>}
      <div className="mt-4 flex flex-wrap gap-2">{current&&<button className={secondaryClass} disabled={busy} onClick={()=>void download(document,current)}>Download</button>}<button className={secondaryClass} onClick={()=>setHistory(history===document.id?null:document.id)}>Version History</button>{owner&&document.context!=='LOAD'&&<button className={secondaryClass} disabled={busy} onClick={()=>{setReplacement(document);uploadKey.current=null;formRef.current?.reset();formRef.current?.scrollIntoView({behavior:'smooth',block:'center'});}}>Upload New Version</button>}</div>
      {history===document.id&&<ol className="mt-4 space-y-3">{document.versions.map(version=><li key={version.id} className="rounded border border-slate-200 p-3"><p>Version {version.versionNumber} — {version.originalFileName}</p><p className="mt-1 break-all text-xs text-slate-600">SHA-256: {version.checksum}</p><button className="mt-2 text-sm text-blue-700" disabled={busy} onClick={()=>void download(document,version)}>Download version {version.versionNumber}</button></li>)}</ol>}
      </Panel>;
    })}</div>}
  </ManagementPage>;
}
