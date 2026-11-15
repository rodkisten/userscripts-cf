import {createSignal,For,onCleanup,onMount,type JSX} from "solid-js";
import type {EntrySource,InspectorEntry,InternalRenderContext} from "./types";
export function VirtualList(props:{source:EntrySource;context:InternalRenderContext;footer?:JSX.Element;renderRow:(entry:InspectorEntry|undefined,index:number)=>JSX.Element}){
 let host!:HTMLDivElement;
 const [scroll,setScroll]=createSignal(0);
 const [height,setHeight]=createSignal(360);
 let observer:ResizeObserver|undefined;
 const row=()=>props.context.options.virtualRowHeight;
 const count=()=>props.source.count;
 const start=()=>Math.max(0,Math.floor(scroll()/row())-props.context.options.virtualOverscan);
 const end=()=>Math.min(count(),Math.ceil((scroll()+height())/row())+props.context.options.virtualOverscan);
 const indices=()=>Array.from({length:end()-start()},(_,i)=>i+start());
 onMount(()=>{if(typeof ResizeObserver!=="undefined"){observer=new ResizeObserver(()=>setHeight(host.clientHeight));observer.observe(host)}setHeight(host.clientHeight||360)});
 onCleanup(()=>observer?.disconnect());
 return <div ref={host} class="rod-inspector__body" data-virtualized="true" style={{"max-height":props.context.options.virtualMaxHeight+"px","overflow-y":"auto"}} onScroll={e=>setScroll(e.currentTarget.scrollTop)}>
  <div style={{height:start()*row()+"px"}}/>
  <For each={indices()}>{i=><div class="rod-inspector__virtual-row" style={{"min-height":row()+"px"}}>{props.renderRow(props.source.get(i),i)}</div>}</For>
  <div style={{height:Math.max(0,count()-end())*row()+"px"}}/>{props.footer}
 </div>;
}
