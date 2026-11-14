import {test,expect} from '@playwright/test';
test('back office reviews current versions, requires reasons, and shows rejected paperwork',async({page})=>{
  const loadId='00000000-0000-4000-8000-000000000010';
  const requirements=[{id:'bol',documentType:'BOL',status:'RECEIVED',reason:null as string|null,documentId:'doc-bol',versionId:'version-bol',versionNumber:1,fileName:'bol.pdf',uploadedBy:'Marcus Reed'},{id:'pod',documentType:'POD',status:'RECEIVED',reason:null as string|null,documentId:'doc-pod',versionId:'version-pod',versionNumber:1,fileName:'pod.pdf',uploadedBy:'Marcus Reed'},{id:'scale',documentType:'SCALE_TICKET',status:'MISSING',reason:null as string|null,documentId:null,versionId:null,versionNumber:null,fileName:null,uploadedBy:null}];
  await page.route(`**/api/v1/back-office/loads/${loadId}/requirements**`,async route=>{
    if(route.request().method()==='GET'){await route.fulfill({json:{loadStatus:'DELIVERED',requirements}});return;}
    const action=route.request().url().split('/').pop();const requirementId=route.request().url().split('/').at(-2);const item=requirements.find(row=>row.id===requirementId)!;
    const body=route.request().postDataJSON() as {versionId?:string;reason?:string};
    expect(body.versionId??null).toBe(item.versionId);
    if(action!=='accept')expect(body.reason?.trim()).toBeTruthy();
    item.status=action==='accept'?'ACCEPTED':action==='reject'?'REJECTED':'WAIVED';item.reason=body.reason??null;
    await route.fulfill({json:{changed:true,status:item.status}});
  });
  await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('backoffice@example.com');await page.getByLabel('Password',{exact:true}).fill('local-fixture-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('button',{name:'Sign out'})).toBeVisible();
  await page.goto(`/back-office/loads/${loadId}/review`);
  await expect(page.getByRole('button',{name:'Reject POD',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Accept BOL',exact:true}).click();await expect(page.getByText('ACCEPTED',{exact:true})).toBeVisible();
  await page.getByLabel('Reason for POD',{exact:true}).fill('Unreadable signature');await page.getByRole('button',{name:'Reject POD',exact:true}).click();await expect(page.getByText('Reason: Unreadable signature — Needs re-upload',{exact:true})).toBeVisible();
  await page.getByLabel('Reason for SCALE_TICKET',{exact:true}).fill('Customer waived scale ticket');await page.getByRole('button',{name:'Waive SCALE_TICKET',exact:true}).click();await expect(page.getByText('WAIVED',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Accept POD',exact:true})).toHaveCount(0);
});
