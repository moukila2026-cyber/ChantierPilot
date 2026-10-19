// Seul le carnet terrain est persistant. Aucun cookie, mot de passe ou pièce financière.
// Outbox cloisonnée entreprise + utilisateur ; UUID conservé pour les retries.
import { api } from './api.js';
const DB='chantierpilot-terrain-v1';
async function db() {
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open(DB,1);
    r.onupgradeneeded=()=>{r.result.createObjectStore('entries',{keyPath:'key'});};
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });
}
async function transaction(mode,fn) {
  const connection=await db();
  return new Promise((resolve,reject)=>{
    const tx=connection.transaction('entries',mode);let result;
    const request=fn(tx.objectStore('entries'));
    request.onsuccess=()=>{result=request.result;};
    tx.oncomplete=()=>{connection.close();resolve(result);};
    tx.onerror=()=>{connection.close();reject(tx.error);};
    tx.onabort=()=>{connection.close();reject(tx.error||new Error('Stockage local indisponible.'));};
  });
}
export const ownerKey=(company,user)=>`${company.id}:${user.id}`;
export async function fieldSnapshot(owner,data,scope='') {
  const snapshot={projects:data.projects,users:data.users,workers:data.workers.map(({daily_rate,...w})=>w),tasks:data.tasks,journal:data.journal,attendance:data.attendance.map(({cost,...a})=>a),advances:[],advanceEntries:[],items:[],purchases:[],stock:[],movements:[]};
  await transaction('readwrite',store=>store.put({key:`snapshot:${owner}:${scope}`,owner,snapshot,at:Date.now()}));
}
export const readSnapshot=(owner,scope='')=>transaction('readonly',store=>store.get(`snapshot:${owner}:${scope}`));
export async function pending(owner) {
  const rows=await transaction('readonly',store=>store.getAll());
  return rows.filter(r=>r.owner===owner && r.body).sort((a,b)=>a.at-b.at);
}
export async function enqueue(owner,body) {
  if(!['journal','attendance'].includes(body.action))throw new Error('Seuls le journal et les présences peuvent être saisis hors ligne.');
  if((await pending(owner)).length>=50)throw new Error('50 saisies locales en attente : synchronisez avant de continuer.');
  await transaction('readwrite',store=>store.put({key:`outbox:${owner}:${body.request_id}`,owner,body,at:Date.now(),error:null}));
}
export const removePending=key=>transaction('readwrite',store=>store.delete(key));
export async function syncPending(owner) {
  const identity=await api('/api/auth/session');
  if(ownerKey(identity.company,identity.user)!==owner)throw new Error('Le compte connecté a changé. Reconnectez le compte propriétaire de ces saisies.');
  const rows=await pending(owner);let synced=0;
  for(const entry of rows) {
    try {
      await api('/api/operations',{method:'POST',body:entry.body});
      await removePending(entry.key);synced++;
    } catch(e) {
      await transaction('readwrite',store=>store.put({...entry,error:e.message}));
      if(e.status===0||e.status===401||e.status===402)break;
    }
  }
  return synced;
}
export async function clearFieldData() {
  await transaction('readwrite',store=>store.clear());
}
