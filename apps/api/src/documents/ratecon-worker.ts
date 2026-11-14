// Executed in a disposable Node child. No application environment or database credentials.
// Modules and language data are local pinned dependencies; document bytes never become URLs.
export const rateconWorkerSource = String.raw`
// Also bound orphaned workers if the API process exits before its own deadline.
const deadline=setTimeout(()=>process.exit(2),120000);
const paths=JSON.parse(process.argv[1]);
const {PDFParse}=require(paths.pdf),{CanvasFactory}=require(paths.canvas);
const {createWorker}=require(paths.ocr),lang=require(paths.lang);
global.fetch=()=>Promise.reject(new Error('NETWORK_DISABLED'));
const chunks=[];let size=0;
process.stdin.on('data',b=>{size+=b.length;if(size>10485760)process.exit(2);chunks.push(b)});
process.stdin.on('end',async()=>{
 let parser,ocr;const pages=[];let count=0;
 const check=(w,h)=>{if(!w||!h||w>10000||h>10000||w*h>20000000)throw Error('IMAGE_LIMIT')};
 const recognize=async(bytes)=>{
  ocr??=await createWorker('eng',1,{langPath:lang.langPath,gzip:true,cacheMethod:'none',logger:()=>{}});
  const r=await ocr.recognize(bytes,{rotateAuto:true});return r.data.text;
 };
 const add=(page,text,method)=>{text=text.trim();count+=text.length;if(count>100000)throw Error('TEXT_LIMIT');pages.push({page,text,method})};
 try{
  const bytes=Buffer.concat(chunks);
  if(paths.mime==='application/pdf'){
   parser=new PDFParse({data:bytes,CanvasFactory,isEvalSupported:false,useSystemFonts:false,maxImageSize:20000000,stopAtErrors:true,verbosity:0});
   const info=await parser.getInfo();if(info.total<1||info.total>10)throw Error('PAGE_LIMIT');
   const dimensions=await parser.getInfo({parsePageInfo:true});
   for(let page=1;page<=info.total;page++){
    const result=await parser.getText({partial:[page],pageJoiner:''});const text=result.pages.map(p=>p.text).join('\n').trim();
    if((text.match(/[A-Za-z0-9]/g)||[]).length>=40)add(page,text,'PDF_TEXT');
    else{const dim=dimensions.pages.find(p=>p.pageNumber===page);if(!dim)throw Error('INVALID_PDF');check(Math.ceil(dim.width*2),Math.ceil(dim.height*2));const shot=await parser.getScreenshot({partial:[page],scale:2,imageDataUrl:false});check(shot.pages[0].width,shot.pages[0].height);add(page,await recognize(Buffer.from(shot.pages[0].data)),'LOCAL_OCR');}
   }
  }else add(1,await recognize(bytes),'LOCAL_OCR');
  if(!pages.some(p=>p.text.trim()))throw Error('NO_TEXT');
  process.stdout.write(JSON.stringify({pages,ocrPages:pages.filter(p=>p.method==='LOCAL_OCR').length,characters:count}));
 }catch(e){const code=['PAGE_LIMIT','IMAGE_LIMIT','TEXT_LIMIT','NO_TEXT'].includes(e.message)?e.message:'PROCESSING_FAILED';process.stdout.write(JSON.stringify({error:code}));}
 finally{if(parser)await parser.destroy().catch(()=>{});if(ocr)await ocr.terminate().catch(()=>{});clearTimeout(deadline);}
});`;
