import type {EntrySource,InspectorEntry,NormalizedInspectorOptions,RodInspectorOptions,RodInspectorPropertyKey,RodInspectorTheme} from "./types";
const safe=<T>(fn:()=>T,fallback:T):T=>{try{return fn()}catch{return fallback}};
export const safeCall=safe;
export const clamp=(n:number,min:number,max:number)=>Math.min(max,Math.max(min,n));
export const isObjectLike=(v:unknown):v is object=>v!==null&&(typeof v==="object"||typeof v==="function");
export const isDomNode=(v:unknown):v is Node=>isObjectLike(v)&&safe(()=>typeof (v as Node).nodeType==="number"&&typeof (v as Node).nodeName==="string",false);
export const isDomElement=(v:unknown):v is Element=>isDomNode(v)&&v.nodeType===1;
export const safeKeyText=(k:RodInspectorPropertyKey)=>safe(()=>String(k),"[Unprintable key]");
export const safePrimitiveText=(v:unknown,quote:boolean)=>v===null?"null":v===undefined?"undefined":typeof v==="string"?(quote?JSON.stringify(v):v):typeof v==="bigint"?v+"n":typeof v==="function"?"ƒ "+safe(()=>(v as Function).name,"anonymous")+"()":safe(()=>String(v),"[Unprintable value]");
export const getPrimitiveClassName=(v:unknown)=>"rod-token--"+(v===null?"null":v===undefined?"undefined":typeof v);
export const DEFAULT_OPTIONS:NormalizedInspectorOptions=Object.freeze({inspectDepth:80,inspectItems:1000,previewItems:3,previewMaxLength:120,expandDepth:0,showPrototype:false,showNonEnumerable:false,showObjectLength:false,virtualize:true,virtualizeAfter:60,virtualRowHeight:24,virtualOverscan:8,virtualMaxHeight:360,virtualRowCache:160,unmountOnCollapse:true,highlightDuration:850,theme:"auto"});
export function normalizeOptions(o:RodInspectorOptions={}):NormalizedInspectorOptions{
 const r={...DEFAULT_OPTIONS};for(const key of Object.keys(r) as (keyof RodInspectorOptions)[]){const value=o[key];if(value===undefined)continue;if(key==="theme"){if(["auto","dark","light"].includes(value as string))r.theme=value as RodInspectorTheme;continue;}if(typeof r[key]==="boolean"){(r as Record<string,unknown>)[key]=typeof value==="boolean"?value:r[key];continue;}if(typeof value==="number"&&Number.isFinite(value))(r as Record<string,unknown>)[key]=clamp(Math.trunc(value),0,key==="inspectItems"?100000:100000);}
 return r;
}
const ids=new WeakMap<object,number>();let nextId=1;
export function getObjectId(v:object){let id=ids.get(v);if(!id){id=nextId++;ids.set(v,id)}return id}
export function getElementPreviewParts(e:Element){return {tagName:e.tagName.toLowerCase(),id:e.id,classes:safe(()=>Array.from(e.classList).slice(0,8),[] as string[])}}
export function getDomNodePreviewText(n:Node){if(isDomElement(n)){const p=getElementPreviewParts(n);return "<"+p.tagName+(p.id?"#"+p.id:"")+p.classes.map(x=>"."+x).join("")+">"}return n.nodeName.toLowerCase()}
export function getObjectPreview(v:unknown,o:NormalizedInspectorOptions=DEFAULT_OPTIONS):string{
 if(!isObjectLike(v))return safePrimitiveText(v,true);
 const id=" #"+getObjectId(v);
 if(isDomNode(v))return getDomNodePreviewText(v)+id;
 if(Array.isArray(v))return "Array("+v.length+")"+id;
 if(v instanceof Map)return "Map("+v.size+")"+id;
 if(v instanceof Set)return "Set("+v.size+")"+id;
 if(v instanceof Date)return "Date"+id+" "+safe(()=>v.toISOString(),"Invalid Date");
 if(v instanceof RegExp)return "RegExp"+id+" "+v;
 if(v instanceof Error)return v.name+id+": "+v.message;
 const name=typeof v==="function"?"ƒ "+(v.name||"anonymous")+"()":safe(()=>Object.getPrototypeOf(v)?.constructor?.name||"Object","Object");
 const keys=safe(()=>Reflect.ownKeys(v),[] as PropertyKey[]).filter(k=>safe(()=>Object.getOwnPropertyDescriptor(v,k)?.enumerable,false)).slice(0,o.previewItems);
 const preview=keys.map(k=>{const d=safe(()=>Object.getOwnPropertyDescriptor(v,k),undefined);return String(k)+": "+(d&&"value" in d?(isObjectLike(d.value)?"{…}":safePrimitiveText(d.value,true)):"(…)")}).join(", ");
 return (name+id+" {"+preview+"}").slice(0,o.previewMaxLength);
}
export function createEntrySource(v:object,o:NormalizedInspectorOptions):EntrySource{
 const entries:InspectorEntry[]=[];let total=0;
 const add=(e:InspectorEntry)=>{total++;if(entries.length<o.inspectItems)entries.push(e)};
 const data=(key:RodInspectorPropertyKey,value:unknown):InspectorEntry=>({kind:"data",key,value,enumerable:true,configurable:false,writable:false});
 if(v instanceof Map){let i=0;for(const [mapKey,value] of v){add({kind:"map-entry",key:i++,mapKey,value,enumerable:true});if(i>=o.inspectItems)break}total=v.size}
 else if(v instanceof Set){let i=0;for(const value of v){add({kind:"set-entry",key:i++,value,enumerable:true});if(i>=o.inspectItems)break}total=v.size}
 else if(isDomNode(v)){if(isDomElement(v))for(const a of Array.from(v.attributes))add(data("@"+a.name,a.value));Array.from(v.childNodes).forEach((node,i)=>add(data(i,node)))}
 else {
 const keys=safe(()=>Reflect.ownKeys(v),[] as PropertyKey[]);
 for(const key of keys){const d=safe(()=>Object.getOwnPropertyDescriptor(v,key),undefined);if(!d||(!o.showNonEnumerable&&!d.enumerable))continue;
 if("value" in d)add({kind:"data",key,value:d.value,enumerable:!!d.enumerable,configurable:!!d.configurable,writable:!!d.writable});
 else add({kind:"accessor",key,owner:v,getter:d.get,setter:d.set,enumerable:!!d.enumerable,configurable:!!d.configurable});}
 }
 if(o.showPrototype){const proto=safe(()=>Object.getPrototypeOf(v),null);if(proto)add({kind:"prototype",key:"[[Prototype]]",value:proto,enumerable:false})}
 return {count:entries.length,total,hasMore:total>entries.length,get:i=>entries[i]};
}
export function getRectRelativeToWindow(e:Element){return safe(()=>e.getBoundingClientRect(),null)}
