import { useEffect,useRef,useState } from 'react';
import { Button } from './ui.jsx';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
// Les repères sont normalisés dans le repère de la page rendue, sans dépendre du zoom.
export default function PlanViewer({plan,annotations,onMark,onResolve,admin}){
 const canvas=useRef(null),[page,setPage]=useState(1),[pages,setPages]=useState(1),[size,setSize]=useState(null),[error,setError]=useState('');
 useEffect(()=>{let disposed=false,loading=null,render=null,doc=null;setError('');setSize(null);setPages(1);
  (async()=>{const res=await fetch(`/api/advanced?plan_file=${plan.id}`,{credentials:'include'});if(!res.ok)throw new Error('Impossible de charger le plan.');
   if(plan.mime==='application/pdf'){
    const pdf=await import('pdfjs-dist');if(disposed)return;pdf.GlobalWorkerOptions.workerSrc=workerSrc;const bytes=new Uint8Array(await res.arrayBuffer());if(disposed)return;
    loading=pdf.getDocument({data:bytes,isEvalSupported:false,useWasm:false,cMapUrl:'/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/pdfjs/standard_fonts/',wasmUrl:'/pdfjs/wasm/'});doc=await loading.promise;if(disposed)return;setPages(doc.numPages);
    const sheet=await doc.getPage(page),base=sheet.getViewport({scale:1}),viewport=sheet.getViewport({scale:Math.min(1.5,2500/base.width,3500/base.height)});if(disposed)return;
    const node=canvas.current;node.width=viewport.width;node.height=viewport.height;setSize({width:viewport.width,height:viewport.height});render=sheet.render({canvasContext:node.getContext('2d'),viewport});await render.promise;
   }else{const blob=await res.blob(),bitmap=await createImageBitmap(blob);if(!disposed){const node=canvas.current;const scale=Math.min(1,2500/bitmap.width,3500/bitmap.height);node.width=Math.ceil(bitmap.width*scale);node.height=Math.ceil(bitmap.height*scale);node.getContext('2d').drawImage(bitmap,0,0,node.width,node.height);setSize({width:node.width,height:node.height});}bitmap.close();}
  })().catch(e=>{if(!disposed)setError(e.message);});
  return()=>{disposed=true;render?.cancel();loading?.destroy().catch(()=>{});};
 },[plan.id,plan.mime,page]);
 const marks=annotations.filter(a=>a.plan_id===plan.id&&a.page===page);
 return <div className="space-y-3"><div className="flex flex-wrap items-center gap-3"><Button variant="secondary" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Page précédente</Button><span>Page {page} / {pages}</span><Button variant="secondary" disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>Page suivante</Button><a className="text-sm text-blue-700 underline" href={`/api/advanced?plan_file=${plan.id}`} target="_blank" rel="noreferrer">Original</a></div>
 <p className="text-xs text-slate-500">Cliquez sur le plan pour ajouter une observation à cet emplacement. Les annotations restent attachées à cette révision, sans modifier l’original.</p>
 {error&&<p role="alert" className="text-red-700">{error}</p>}
 <div className="relative w-full overflow-hidden rounded border bg-white" style={size?{aspectRatio:`${size.width}/${size.height}`}:{minHeight:100}} onClick={e=>{if(!size)return;const r=e.currentTarget.getBoundingClientRect();onMark({page,x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))});}}>
 <canvas ref={canvas} className="block h-auto w-full" aria-label={`Plan ${plan.title}, page ${page}`}/>{marks.map((a,i)=><span key={a.id} title={a.note} className={`pointer-events-none absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-bold text-white ${a.status==='resolved'?'bg-emerald-600':'bg-red-600'}`} style={{left:`${a.x*100}%`,top:`${a.y*100}%`}}>{i+1}</span>)}</div>
 <Button variant="secondary" disabled={!size} onClick={()=>onMark({page,x:.5,y:.5})}>Ajouter un repère au centre</Button>
 <ol className="space-y-2">{marks.map((a,i)=><li key={a.id} className="rounded border bg-white p-3 text-sm"><strong>{i+1}. {a.status==='resolved'?'Résolue':'Ouverte'}</strong> — {a.note}{admin&&a.status==='open'&&<Button variant="secondary" className="ml-2" onClick={()=>onResolve(a.id)}>Résoudre</Button>}</li>)}</ol></div>;
}
