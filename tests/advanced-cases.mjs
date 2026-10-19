import crypto from 'node:crypto';
export async function advancedCases({A,B,M,check,project_id,worker_id,item_id}){
 const post=(body,client=A)=>client.post('/api/advanced',{...body,request_id:body.request_id||crypto.randomUUID()});
 const user=(await A.get('/api/auth/session')).data.user;
 const base={action:'schedule',project_id,title:'Fondations',start_date:'2026-10-20',end_date:'2026-10-24',progress:10,assignee_id:user.id,predecessor_id:null};
 const t=await post(base);check('Gantt : tâche créée avec dates et responsable',t.status===201,t.data);
 check('Gantt : agent exclu des changements de planning',(await post(base,M)).status===403);
 const next=await post({...base,title:'Élévation',predecessor_id:t.data.result.id,start_date:'2026-10-25',end_date:'2026-10-31'});
 check('Gantt : dépendance fin-début contrôlée',next.status===201&&(await post({...base,title:'Trop tôt',predecessor_id:t.data.result.id})).status===422,next.data);
 check('Gantt : retard incompatible avec successeur refusé',(await post({...base,action:'schedule_update',id:t.data.result.id,end_date:'2026-10-26'})).status===422);
 check('Gantt : cycle refusé',(await post({...base,action:'schedule_update',id:t.data.result.id,predecessor_id:next.data.result.id,start_date:'2026-11-02',end_date:'2026-11-03'})).status===422);
 const wa=await post({action:'warehouse',name:'Dépôt central',address:'Abidjan'}),wb=await post({action:'warehouse',name:'Dépôt secondaire',address:'Bouaké'});
 const a=wa.data.result.id,b=wb.data.result.id;
 const movement={action:'warehouse_move',item_id,from_id:null,to_id:a,project_id:null,quantity:'10',reference:'Inventaire initial validé'};
 check('Dépôts : ouverture du stock',(await post(movement)).status===201);
 const transfer={...movement,from_id:a,to_id:b,quantity:'4',reference:'Transfert 001',request_id:crypto.randomUUID()};
 const moved=await post(transfer),replay=await post(transfer);
 check('Dépôts : transfert rejoué sans doublon',moved.status===201&&replay.data.result.id===moved.data.result.id);
 const concurrent=await Promise.all([post({...movement,from_id:a,to_id:b,quantity:'5'}),post({...movement,from_id:a,to_id:b,quantity:'5'})]);
 check('Dépôts : concurrence sans stock négatif',concurrent.map(r=>r.status).sort().join(',')==='201,409');
 check('Dépôts : sortie vers chantier alimente son stock',(await post({...movement,from_id:b,to_id:null,project_id,quantity:'2',reference:'Livraison chantier'})).status===201);
 const stock=(await A.get('/api/advanced')).data.stock;
 check('Dépôts : soldes cohérents après les transferts',Number(stock.find(s=>s.warehouse_id===a).available_milli)===1000&&Number(stock.find(s=>s.warehouse_id===b).available_milli)===7000);
 check('Dépôts : source étrangère inaccessible',(await post({...movement,from_id:a,to_id:null,quantity:'1'},B)).status===404);
 const file={filename:'plan.png',mime:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aI5sAAAAASUVORK5CYII='};
 const plan=await post({action:'plan',project_id,title:'Plan fondations',revision:'A1',file});
 check('Plans : révision stockée avec contrôle du fichier',plan.status===201,plan.data);
 const id=plan.data.result.id;
 const ann=await post({action:'annotation',plan_id:id,page:1,x:.3,y:.6,note:'Reprise à contrôler'},M);
 check('Plans : annotation terrain positionnée',ann.status===201);
 check('Plans : coordonnées hors page refusées',(await post({action:'annotation',plan_id:id,page:1,x:2,y:0,note:'Hors page'})).status===422);
 check('Plans : image limitée à une page',(await post({action:'annotation',plan_id:id,page:2,x:0,y:0,note:'Page fictive'})).status===422);
 check('Plans : original inaccessible à une autre entreprise',(await B.get(`/api/advanced?plan_file=${id}`)).status===404);
 check('Plans : résolution réservée à la direction',(await post({action:'annotation_resolve',id:ann.data.result.id},M)).status===403&&(await post({action:'annotation_resolve',id:ann.data.result.id})).status===201);
 for(const action of ['payroll_profile','payroll','payroll_update','payroll_approve','payroll_pay','signature']){
  check(`Module retiré : action ${action} indisponible`,(await post({action})).status===422);
 }
 check('Module retiré : ancien téléchargement de bulletin indisponible',(await A.get(`/api/advanced?payroll_pdf=${crypto.randomUUID()}`)).status===410);
 const data=(await A.get('/api/advanced')).data;
 check('Modules retirés : aucune donnée ni statut dans l’API',!('profiles' in data)&&!('slips' in data)&&!('signature' in data));
 check('Extensions : entreprise étrangère ne voit aucune ligne',(await B.get('/api/advanced')).data.plans.length===0&&(await B.get('/api/advanced')).data.tasks.length===0);
 const tax=await A.patch('/api/company',{tax_number:'NCC-TEST-001',tax_regime:'Régime témoin'});
 check('Entreprise : identité fiscale conservée',tax.status===200&&tax.data.company.tax_number==='NCC-TEST-001');
 const backup=(await A.get('/api/export?scope=all&format=json')).data;
 check('Sauvegarde : plans et dépôts préservés',backup.operations?.warehouses?.length>0&&backup.operations?.plan_versions?.length>0&&!backup.operations.plan_versions[0].file);
}
