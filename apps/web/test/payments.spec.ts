import {test,expect} from '@playwright/test';
test('partial payments preserve retry key and show remaining balance before final settlement',async({page})=>{
  const invoice={id:'00000000-0000-4000-8000-000000000010',loadNumber:'D7-PAY',brokerName:'Test Broker',status:'INVOICED',totalRate:'3250.00',invoiceNumber:'TEST-INV',invoiceIssuedAt:'2026-09-20T00:00:00Z',billingSubmittedAt:'2026-09-20T00:00:00Z',paymentTermsDays:30,paymentDueAt:'2026-10-20T00:00:00Z',billingRecipientName:'Test Broker',billingRecipientEmail:null,amountPaid:'0.00',remainingBalance:'3250.00',paidAt:null as string|null,agingStatus:'OUTSTANDING',daysUntilDue:30};
  const operations=new Map<string,string>();const keys:string[]=[];let loseFirst=true;
  await page.route('**/api/v1/back-office/accounts-receivable',route=>route.fulfill({json:{generatedAt:new Date().toISOString(),summary:{outstanding:{amount:invoice.remainingBalance,count:invoice.status==='PAID'?0:1},dueSoon:{amount:'0.00',count:0},overdue:{amount:'0.00',count:0},paid:{amount:invoice.status==='PAID'?'3250.00':'0.00',count:invoice.status==='PAID'?1:0}},invoices:[invoice]}}));
  await page.route('**/api/v1/back-office/accounts-receivable/loads/*/mark-paid',async route=>{
    const body=route.request().postDataJSON() as {amountPaid:string;idempotencyKey:string};keys.push(body.idempotencyKey);
    expect(body.idempotencyKey).toMatch(/^[a-f0-9-]{36}$/);
    const recorded=!operations.has(body.idempotencyKey);
    if(recorded){operations.set(body.idempotencyKey,body.amountPaid);if(body.amountPaid==='1000.00'){invoice.amountPaid='1000.00';invoice.remainingBalance='2250.00';}else{expect(body.amountPaid).toBe('2250.00');invoice.amountPaid='3250.00';invoice.remainingBalance='0.00';invoice.status='PAID';invoice.paidAt=new Date().toISOString();}}
    if(loseFirst){loseFirst=false;await route.fulfill({status:503,json:{message:'Temporary response failure. Retry this payment.'}});return;}
    await route.fulfill({json:{recorded,message:invoice.status==='PAID'?'Invoice is fully paid.':'Partial payment recorded.',load:invoice}});
  });
  page.on('dialog',dialog=>void dialog.accept());
  await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('backoffice@example.com');await page.getByLabel('Password',{exact:true}).fill('local-fixture-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('button',{name:'Sign out'})).toBeVisible();
  await page.getByRole('link',{name:'Accounts Receivable',exact:true}).click();
  await page.getByLabel('Payment amount for D7-PAY').fill('1000.00');await page.getByRole('button',{name:'Record Payment'}).click();
  await expect(page.getByText('Temporary response failure. Retry this payment.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Record Payment'}).click();
  await expect(page.getByText('Remaining: $2,250.00',{exact:true})).toBeVisible();
  await expect(page.getByText('Paid: $1,000.00',{exact:true})).toBeVisible();
  expect(keys[0]).toBe(keys[1]);expect(operations.size).toBe(1);
  await expect(page.getByLabel('Payment amount for D7-PAY')).toHaveValue('2250.00');
  await page.getByRole('button',{name:'Record Payment'}).click();
  await expect(page.getByText('Remaining: $0.00',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Record Payment'})).toHaveCount(0);expect(operations.size).toBe(2);expect(keys[2]).not.toBe(keys[1]);
});
