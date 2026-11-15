// Local alert subscriptions (stored in the browser). Owned by the "platform pages" job; TopBarTools only reads the count.
export interface Subscription { id: string; label: string; areaKey: string; threshold: 'p90'; channels: string[]; createdAt: string }
const KEY = 'firely.alerts';
export function loadSubscriptions(): Subscription[] {
  try { return JSON.parse(window.localStorage.getItem(KEY) ?? '[]') as Subscription[]; } catch { return []; }
}
export function saveSubscriptions(list: Subscription[]): void {
  try { window.localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private mode */ }
}
export function addSubscription(list:Subscription[], label:string, areaKey:string):Subscription[] {
 if(list.some(s=>s.areaKey===areaKey)) return list;
 return [...list,{id:crypto.randomUUID(),label,areaKey,threshold:'p90',channels:['feed CAP'],createdAt:new Date().toISOString()}];
}
export function removeSubscription(list:Subscription[],id:string):Subscription[] { return list.filter(s=>s.id!==id); }
