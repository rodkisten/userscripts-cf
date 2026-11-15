import {createMemo,createSignal,For,Show,type JSX} from "solid-js";
import {createEntrySource,getObjectPreview,getPrimitiveClassName,isObjectLike,normalizeOptions,safePrimitiveText,safeKeyText,isDomElement,getRectRelativeToWindow} from "./core";
import {VirtualList} from "./VirtualList";
import type {InspectorEntry,InternalRenderContext,ObjectInspectorProps} from "./types";
import "./inspector.css";
function Value(props:{value:unknown;context:InternalRenderContext}):JSX.Element{
 const v=props.value;
 if(!isObjectLike(v))return <span class={getPrimitiveClassName(v)}>{safePrimitiveText(v,props.context.quoteStrings)}</span>;
 if(props.context.ancestors.has(v))return <span class="rod-token--warning">↩ {getObjectPreview(v,props.context.options)}</span>;
 if(props.context.depth>=props.context.options.inspectDepth)return <span class="rod-token--meta">{getObjectPreview(v,props.context.options)}</span>;
 const next={...props.context,ancestors:new Set([...props.context.ancestors,v])};
 const initiallyOpen=props.context.depth<props.context.options.expandDepth;
 const [open,setOpen]=createSignal(initiallyOpen);
 const [visited,setVisited]=createSignal(initiallyOpen);
 const source=createMemo(()=>open()||(!props.context.options.unmountOnCollapse&&visited())?createEntrySource(v,props.context.options):null);
 const row=(entry:InspectorEntry|undefined):JSX.Element=>{
  if(!entry)return <span class="rod-token--warning">[Property unavailable]</span>;
  const child={...next,depth:next.depth+1,quoteStrings:true};
  return <div class="rod-inspector__row"><span class="rod-inspector__key">{safeKeyText(entry.key)}</span><span class="rod-token--meta">: </span>
   {entry.kind==="accessor"?<Accessor entry={entry} context={child}/>:
    entry.kind==="empty"?<span class="rod-token--meta">empty</span>:
    entry.kind==="map-entry"?<><Value value={entry.mapKey} context={child}/> =&gt; <Value value={entry.value} context={child}/></>:
    <Value value={entry.value} context={child}/>}
  </div>;
 };
 return <details class="rod-inspector" data-theme={props.context.options.theme} open={initiallyOpen} onToggle={e=>{setOpen(e.currentTarget.open);if(e.currentTarget.open)setVisited(true)}}>
  <summary>{getObjectPreview(v,props.context.options)}
  <Show when={isDomElement(v)}><button type="button" class="rod-inspector__inspect" title="Destacar elemento" onClick={e=>{e.preventDefault();e.stopPropagation();(v as Element).scrollIntoView({block:"center",behavior:"smooth"});const rect=getRectRelativeToWindow(v as Element);if(rect){const overlay=document.createElement("div");overlay.style.cssText="position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #7dd3fc;background:#38bdf833;left:"+rect.left+"px;top:"+rect.top+"px;width:"+rect.width+"px;height:"+rect.height+"px";document.body.append(overlay);setTimeout(()=>overlay.remove(),props.context.options.highlightDuration)}}}>◎</button></Show>
  </summary>
  <Show when={source()}>{s=><Show when={s().count>=props.context.options.virtualizeAfter&&props.context.options.virtualize} fallback={<div class="rod-inspector__body"><For each={Array.from({length:s().count},(_,i)=>i)}>{i=>row(s().get(i))}</For></div>}>
   <VirtualList source={s()} context={next} renderRow={row}/>
  </Show>}</Show>
 </details>;
}
function Accessor(props:{entry:Extract<InspectorEntry,{kind:"accessor"}>;context:InternalRenderContext}){
 const [state,setState]=createSignal<{value?:unknown;error?:unknown;status:"idle"|"done"|"error"}>({status:"idle"});
 return <Show when={state().status!=="idle"} fallback={<button class="rod-inspector__getter" disabled={!props.entry.getter} onClick={()=>{try{setState({status:"done",value:props.entry.getter?.call(props.entry.owner)})}catch(error){setState({status:"error",error})}}}>(…)</button>}>
 <Value value={state().status==="done"?state().value:state().error} context={props.context}/>
 </Show>;
}
export function ObjectInspector(props:ObjectInspectorProps){
 const options=createMemo(()=>normalizeOptions(props.options));
 const context=():InternalRenderContext=>({depth:0,ancestors:new Set<object>(),quoteStrings:props.quoteStrings!==false,options:options()});
 return <div class={props.class}><Value value={props.value} context={context()}/></div>;
}
