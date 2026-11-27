import {useState,useRef,useEffect,type ReactNode} from "react";
import {ChevronRight,ChevronDown,Folder,FolderOpen,File,FileCode,FileJson} from "lucide-react";
import {filterTree,type FileTreeNode} from "./file-tree-core";
export type {FileTreeNode,FileTreeEntry} from "./file-tree-core";
export {buildTree,filterTree} from "./file-tree-core";
export interface FileTreeProps {
 nodes: FileTreeNode[];
 selected?: ReadonlySet<string>;
 onSelect?: (path:string)=>void;
 current?: string;
 query?: string;
 loadFolder?: (node:FileTreeNode)=>Promise<FileTreeNode[]>;
 href?: (node:FileTreeNode)=>string;
 onOpen?: (node:FileTreeNode)=>void;
 renderActions?: (node:FileTreeNode)=>ReactNode;
}
export function FileTree(props:FileTreeProps){
 return <div role="group" aria-label="Files" className="min-w-0">{filterTree(props.nodes,props.query??"").map(node=><Row key={node.path} {...props} node={node} depth={0}/>)}</div>;
}
function Row({node,depth,...props}:FileTreeProps & {node:FileTreeNode;depth:number}){
 const [expanded,setExpanded]=useState(Boolean(props.current && (props.current===node.path||props.current.startsWith(node.path+"/"))));
 const [loaded,setLoaded]=useState<FileTreeNode[]|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const pending=useRef(false);
 const children=loaded??node.children;
 const open=expanded||Boolean(props.query?.trim()&&children.length);
 const load=async()=>{if(pending.current||loaded!==null||node.children.length||!props.loadFolder)return;pending.current=true;setBusy(true);setError("");try{setLoaded(await props.loadFolder(node));}catch(e){setError(e instanceof Error?e.message:String(e));}finally{pending.current=false;setBusy(false);}};
 useEffect(()=>{if(expanded&&node.folder&&node.sha&&!node.children.length)void load();},[expanded,node.path,node.sha]);
 const Icon=node.folder?(open?FolderOpen:Folder):/\.json$/i.test(node.name)?FileJson:/\.(tsx?|jsx?|css|ya?ml|py|sh|go|rs)$/i.test(node.name)?FileCode:File;
 const link=props.href?.(node);
 return <div>
 <div className="flex min-w-0 items-center gap-1 rounded px-1 py-1 text-sm hover:bg-muted" style={{paddingInlineStart:depth*16+4}}>
 {node.folder?<button type="button" aria-expanded={open} aria-label={(open?"Collapse ":"Expand ")+node.name} className="shrink-0 rounded p-1 focus-visible:ring-2 focus-visible:ring-ring" onClick={()=>setExpanded(!expanded)}>{open?<ChevronDown size={14}/>:<ChevronRight size={14}/>}</button>:<span className="w-6 shrink-0"/>}
 {!node.folder&&props.onSelect&&<input type="checkbox" aria-label={"Select "+node.path} checked={props.selected?.has(node.path)??false} onChange={()=>props.onSelect?.(node.path)}/>}
 <Icon size={16} className="shrink-0 text-muted-foreground" aria-hidden/>
 {link?<a className="min-w-0 flex-1 truncate text-foreground hover:underline" href={link} title={node.path}>{node.name}</a>:<button type="button" className="min-w-0 flex-1 truncate text-left" title={node.path} onClick={()=>node.folder?setExpanded(!expanded):props.onOpen?.(node)}>{node.name}</button>}
 {typeof node.size==="number"&&!node.folder&&<span className="shrink-0 text-xs text-muted-foreground">{(node.size/1024).toFixed(1)} KB</span>}
 {props.renderActions?.(node)}
 </div>
 {node.folder&&open&&<div role="group">{busy&&<div role="status" className="pl-8 text-xs text-muted-foreground">Loading…</div>}{error&&<div role="alert" className="pl-8 text-xs text-destructive">{error} <button type="button" onClick={()=>void load()}>Retry</button></div>}{filterTree(children,props.query??"").map(child=><Row key={child.path} {...props} node={child} depth={depth+1}/>)}</div>}
 </div>;
}
