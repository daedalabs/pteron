import {useState} from 'react';
import {Button} from '../components/ui/button';

type ActivityJob={id:string;kind:string;status:string;progress?:number;stale?:boolean;screenId?:string;objectId?:string;frame?:number;phase?:string;diagnostic?:string;path?:string;cancellable?:boolean};
type ActivityEntry={revision:number;source:string;command:string};

export function ActivityPanel({jobs,revision,activity,formatCommand,onShowIssue,onCancel,onRecovery,onStatus,onError}:{jobs:ActivityJob[];revision:number;activity:ActivityEntry[];formatCommand:(command:string)=>string;onShowIssue:(job:ActivityJob)=>void;onCancel:(id:string)=>void;onRecovery:()=>void;onStatus:(message:string)=>void;onError:(message:string)=>void}){
 const [copied,setCopied]=useState(false);
 const copy=async()=>{
  try{
   const info=await window.pteron.call('connection.info');
   await navigator.clipboard.writeText(JSON.stringify(info.config,null,2));
   onStatus('MCP client configuration copied');
   setCopied(true);
   setTimeout(()=>setCopied(false),2000);
  }catch(error){onError(error instanceof Error?error.message:String(error));}
 };
 const kind=(job:ActivityJob)=>job.kind==='render'?'Render MP4':job.kind;
 return <section className="inspector activity-panel">
  <section className="activity-section" aria-labelledby="activity-jobs-heading">
   <div className="activity-heading"><h3 id="activity-jobs-heading">Jobs{jobs.length>0&&<span className="activity-count">{jobs.length}</span>}</h3></div>
   {jobs.length===0?<p className="activity-empty">No background jobs.</p>:<ul className="activity-job-list activity-jobs">{jobs.map(job=><li className="activity-job" key={job.id}>
    <div className="activity-job-heading"><strong>{kind(job)}</strong><span className={`activity-job-status status-${job.status}`}>{job.status}{job.stale?' · stale':''}</span></div>
    {job.status==='running'&&<div className="activity-progress-row"><progress max="1" value={job.progress??0}/><span>{Math.round((job.progress??0)*100)}%</span></div>}
    {job.phase&&<small>{job.phase}</small>}
    {job.diagnostic&&<p className="error">{job.diagnostic}</p>}
    {job.path&&<div className="activity-path-row"><span>{job.path}</span><Button variant="ghost" className="activity-inline" onClick={()=>void window.pteron.call('shell.showItemInFolder',{path:job.path})}>Show in folder</Button></div>}
    <div className="activity-job-actions">
     {job.status==='failed'&&job.screenId&&<Button variant="ghost" className="activity-inline" aria-label="Show export issue" title="Show export issue" onClick={()=>onShowIssue(job)}>Show issue</Button>}
     {job.status==='running'&&job.cancellable!==false&&<Button variant="ghost" className="activity-inline" aria-label="Cancel" title="Cancel job" onClick={()=>onCancel(job.id)}>Cancel</Button>}
    </div>
   </li>)}</ul>}
  </section>
  <section className="activity-section" aria-labelledby="activity-mcp-heading">
   <div className="activity-heading"><h3 id="activity-mcp-heading">MCP server</h3><span className="activity-note">Revision {revision}</span></div>
   <dl className="activity-facts">
    <dt>Status</dt><dd>Active</dd>
    <dt>Transport</dt><dd>stdio · JSON-RPC 2.0</dd>
   </dl>
   <Button variant="outline" className="activity-copy" onClick={()=>void copy()}>{copied?'Copied':'Copy MCP client config'}</Button>
  </section>
  <section className="activity-section" aria-labelledby="activity-history-heading">
   <div className="activity-heading"><h3 id="activity-history-heading">Command history{activity.length>0&&<span className="activity-count">{activity.length}</span>}</h3><Button variant="ghost" className="activity-inline" aria-label="Preview recovery" title="Preview recovery snapshot" onClick={onRecovery}>Recovery</Button></div>
   {activity.length===0?<p className="activity-empty">No commands yet.</p>:<ol className="activity-history-list">{activity.slice().reverse().map(entry=><li key={entry.revision}>
    <span className="activity-history-revision">r{entry.revision}</span>
    <span className="activity-history-source">{entry.source==='mcp'?'MCP':'UI'}</span>
    <code title={entry.command}>{formatCommand(entry.command)}</code>
   </li>)}</ol>}
  </section>
 </section>;
}
