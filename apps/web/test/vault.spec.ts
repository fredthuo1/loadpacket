import { test, expect, type Page } from '@playwright/test';
import type { VaultDocument } from '../../../packages/api-contracts/vault';
const docId='00000000-0000-4000-8000-000000000301';
function document(version=1): VaultDocument {
  return { id:docId,context:'COMPANY',ownerId:'00000000-0000-4000-8000-000000000001',ownerName:'Test Carrier',type:'W9',status:'UPLOADED',expiration:'EXPIRED',versions:Array.from({length:version},(_,index)=>({id:`00000000-0000-4000-8000-00000000030${version-index+1}`,versionNumber:version-index,originalFileName:version-index===1?'original.pdf':'corrected.pdf',mimeType:'application/pdf',sizeBytes:30,checksum:'a'.repeat(64),uploadedAt:'2026-09-20T01:00:00Z',uploadedBy:'Test Owner',issuedAt:null,expiresAt:'2020-01-01'})) };
}
async function login(page:Page,role='owner') {
  await page.goto('/login');
  await page.getByLabel('Email',{exact:true}).fill(`${role}@example.com`);
  await page.getByLabel('Password',{exact:true}).fill('local-fixture-password');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('button',{name:'Sign out'})).toBeVisible();
}
test('owner uploads, retries safely, replaces and browses immutable history',async({page})=>{
  let docs:VaultDocument[]=[]; const keys:string[]=[]; let failFirst=true;
  await page.route('**/api/v1/documents/vault',route=>route.fulfill({json:docs}));
  await page.route('**/api/v1/company/documents',async route=>{
    const body=route.request().postData()??'';
    const key=/name="uploadKey"\r\n\r\n([^\r]+)/.exec(body)?.[1];
    expect(key).toMatch(/^[a-f0-9-]{36}$/); keys.push(key!);
    docs=[document()];
    if(failFirst){failFirst=false;await route.fulfill({status:503,json:{message:'Temporary upload response failure. Retry.'}});}
    else await route.fulfill({status:201,json:docs[0]});
  });
  await page.route(`**/api/v1/documents/vault/${docId}/versions`,async route=>{
    expect(route.request().postData()).not.toContain('name="type"');
    docs=[document(2)];await route.fulfill({status:201,json:docs[0]});
  });
  await login(page); await page.getByRole('link',{name:'Documents',exact:true}).click();
  await page.getByLabel('File (PDF').setInputFiles({name:'original.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7 original')});
  await page.getByLabel('Expiration date',{exact:true}).fill('2020-01-01');
  await page.getByRole('button',{name:'Upload Document',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'Temporary upload'})).toBeVisible();
  await page.getByRole('button',{name:'Upload Document',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Document uploaded');
  expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]);
  await expect(page.getByText('UPLOADED · EXPIRED',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Upload New Version',exact:true}).click();
  await page.getByLabel('File (PDF').setInputFiles({name:'corrected.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7 corrected')});
  await page.getByRole('button',{name:'Save New Version',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Previous versions remain available');
  await page.getByRole('button',{name:'Version History',exact:true}).click();
  await expect(page.getByText('Version 1 — original.pdf',{exact:true})).toBeVisible();
  await expect(page.getByText('Version 2 — corrected.pdf',{exact:true})).toBeVisible();
  await page.getByLabel('Search documents').fill('no match');
  await expect(page.getByText('No documents match these filters.')).toBeVisible();
});
test('driver vault shows own records without management controls',async({page})=>{
  const own={...document(),context:'DRIVER',type:'CDL',ownerName:'Marcus Reed'};
  await page.route('**/api/v1/documents/vault',route=>route.fulfill({json:[own]}));
  await login(page,'driver');await page.getByRole('link',{name:'Documents',exact:true}).click();
  await expect(page.getByRole('heading',{name:'CDL',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Upload Document',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Company',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Loads',exact:true})).toHaveCount(0);
});
