export class APIError extends Error { constructor(public status:number,message:string){super(message);} }
const base='/api/v1';
export async function api<T>(path:string,body?:unknown,method?:string):Promise<T> {
 let headers:Record<string,string>={};
 const publicAuth=['/auth/register','/auth/login','/auth/password/forgot','/auth/password/reset','/auth/verification/confirm'].includes(path);
 if(body!==undefined){
  headers={'Content-Type':'application/json'};
  if(!publicAuth){
  const csrf=await fetch(`${base}/auth/csrf`,{credentials:'include',cache:'no-store'});
  if(!csrf.ok)throw new APIError(csrf.status,'Xavfsizlik tokenini olish imkoni boʻlmadi.');
  const token=await csrf.json();headers['X-CSRF-Token']=token.csrf_token;
  }
 }
 const response=await fetch(`${base}${path}`,{method:method??(body===undefined?'GET':'POST'),body:body===undefined?undefined:JSON.stringify(body),headers,credentials:'include',cache:'no-store'});
 const data=await response.json().catch(()=>null);
 if(!response.ok){const detail=data?.detail;throw new APIError(response.status,typeof detail==='string'?detail:detail?.message||'Soʻrov bajarilmadi. Qayta urinib koʻring.');}
 return data as T;
}
export type Device={id:string;display_name:string;operating_system:string;architecture:string;status:string;last_seen_at?:string;scopes:string[]};
export type Browser={id:string;name:string;profiles:{id:string;name:string}[]};
export type History={items:{url:string;title:string;visited_at:string;domain:string;visit_count?:number}[];total?:number;page:number;page_size:number};
export type Traffic={received_bytes:number;sent_bytes:number;attribution:string;collected_at:string};
export const queryAgent=(device:string,type:string,params:unknown={})=>api<unknown>(`/devices/${encodeURIComponent(device)}/query`,{type,params});
