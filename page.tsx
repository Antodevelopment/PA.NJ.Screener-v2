"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import realParcels from "./data/real-parcels.json";
import refreshStatus from "./data/refresh-status.json";

type ScoreKey = "underutilization" | "regulatory" | "motivation" | "fit" | "intelligence";
type Stage = "new" | "screening" | "pipeline" | "passed";
type Parcel = {
  id:string; owner:string; ownerType:string; address:string; mailing:string; lot:number; building:number;
  year:number; land:number; improvement:number; zoning:string; flags:string[]; delinquency:string; approvals:string;
  factors:Record<ScoreKey,number>; reason:string; angle:string; status:string;
  state?:string; county?:string; sourceName?:string; sourceUrl?:string; sourceDate?:string; sourceChecked?:string; sourceNote?:string;
};
type OutreachLog = { id?:number; date:string; parcel:string; method:string; response:string; motivation:string; next:string; rating:number };
type Workflow = { parcelId:string; stage:Stage; nextAction:string; updatedAt:string };
type WorkflowMap = Record<string,Workflow>;

const parcels = realParcels as Parcel[];
const scoreKeys:ScoreKey[] = ["underutilization","regulatory","motivation","fit","intelligence"];
const labels:Record<ScoreKey,string> = {
  underutilization:"Underutilization", regulatory:"Regulatory tailwinds", motivation:"Owner friction / motivation",
  fit:"Strategic fit", intelligence:"Outreach intelligence",
};
const factorHelp:Record<ScoreKey,string> = {
  underutilization:"Vacancy, low improvement value, lot size and building coverage",
  regulatory:"Known planning signals; unverified zoning remains neutral",
  motivation:"Ownership structure, tenure, absentee signals and known friction",
  fit:"Geography, assessed value, parcel size and low-equity control potential",
  intelligence:"Your owner feedback: ratings 1–5 map to 10, 30, 50, 75 and 95",
};
const initialWeights:Record<ScoreKey,number> = { underutilization:30, regulatory:25, motivation:20, fit:15, intelligence:10 };
const ratingToIntelligence:Record<number,number> = { 1:10, 2:30, 3:50, 4:75, 5:95 };

function money(value:number) {
  return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(value);
}

function propertyTown(parcel:Parcel) {
  const parts=parcel.address.split(",").map(part=>part.trim()).filter(Boolean);
  return parts.length>=3?parts[parts.length-3]:parcel.address;
}

function parcelLogs(parcelId:string, logs:OutreachLog[]) {
  return logs.filter(log => log.parcel === parcelId);
}

function outreachIntelligence(parcelId:string, logs:OutreachLog[]) {
  const history = parcelLogs(parcelId,logs);
  if (!history.length) return 50;
  return Math.round(history.reduce((sum,log)=>sum+ratingToIntelligence[log.rating],0)/history.length);
}

function factorValue(parcel:Parcel, key:ScoreKey, logs:OutreachLog[]) {
  return key === "intelligence" ? outreachIntelligence(parcel.id,logs) : parcel.factors[key];
}

function score(parcel:Parcel, weights:Record<ScoreKey,number>, logs:OutreachLog[]) {
  return Math.round(scoreKeys.reduce((sum,key)=>sum+factorValue(parcel,key,logs)*weights[key],0)/100);
}

function baseScore(parcel:Parcel, weights:Record<ScoreKey,number>) {
  return Math.round(scoreKeys.reduce((sum,key)=>sum+(key === "intelligence" ? 50 : parcel.factors[key])*weights[key],0)/100);
}

function stageLabel(stage:Stage) {
  return ({new:"Fresh",screening:"Previously screened",pipeline:"Keep",passed:"Passed"} as Record<Stage,string>)[stage];
}

function scoreChange(parcel:Parcel, weights:Record<ScoreKey,number>, logs:OutreachLog[]) {
  return score(parcel,weights,logs)-baseScore(parcel,weights);
}

export default function Home() {
  const [weights,setWeights] = useState(initialWeights);
  const [tab,setTab] = useState("Screen");
  const [selected,setSelected] = useState(parcels[0]);
  const [query,setQuery] = useState("");
  const [logs,setLogs] = useState<OutreachLog[]>([]);
  const [workflows,setWorkflows] = useState<WorkflowMap>({});
  const [showLog,setShowLog] = useState(false);
  const [newListFilter,setNewListFilter] = useState<"active"|"passed"|"all">("active");
  const [geoState,setGeoState] = useState<"all"|"NJ"|"PA">("all");
  const [geoArea,setGeoArea] = useState("all");

  useEffect(()=>{
    fetch("/api/model").then(response=>response.ok?response.json():Promise.reject()).then(data=>{
      if (data.weights) setWeights(data.weights);
      if (data.logs) setLogs(data.logs.map((item:{id:number;contactDate:string;parcelId:string;method:string;response:string;motivation:string;nextAction:string;rating:number})=>({
        id:item.id,date:item.contactDate,parcel:item.parcelId,method:item.method,response:item.response,motivation:item.motivation,next:item.nextAction,rating:item.rating,
      })).reverse());
      if (data.workflows) setWorkflows(Object.fromEntries(data.workflows.map((item:Workflow)=>[item.parcelId,item])));
    }).catch(()=>{});
  },[]);

  const stageFor = (parcelId:string):Stage => workflows[parcelId]?.stage || "new";
  const ranked = useMemo(()=>[...parcels].sort((a,b)=>score(b,weights,logs)-score(a,weights,logs)),[weights,logs]);
  const activeSites = useMemo(()=>ranked.filter(parcel=>!["pipeline","passed"].includes(stageFor(parcel.id))),[ranked,workflows]);
  const geoAreas = useMemo(()=>{
    if (geoState==="NJ") return [...new Set(activeSites.filter(parcel=>parcel.state==="NJ").map(parcel=>parcel.county||"Unknown"))].sort();
    if (geoState==="PA") return [...new Set(activeSites.filter(parcel=>parcel.state==="PA").map(propertyTown))].sort();
    return [];
  },[geoState,activeSites]);
  const geographyPool = useMemo(()=>activeSites.filter(parcel=>{
    if (geoState==="all") return true;
    if (parcel.state!==geoState) return false;
    if (geoArea==="all") return true;
    return geoState==="NJ"?parcel.county===geoArea:propertyTown(parcel)===geoArea;
  }),[activeSites,geoState,geoArea]);
  const screenFive = geographyPool.slice(0,5);
  const pipeline = useMemo(()=>ranked.filter(parcel=>stageFor(parcel.id)==="pipeline"),[ranked,workflows]);
  const previouslyScreened = useMemo(()=>ranked.filter(parcel=>stageFor(parcel.id)==="screening"),[ranked,workflows]);
  const freshSites = useMemo(()=>ranked.filter(parcel=>stageFor(parcel.id)==="new"),[ranked,workflows]);
  const passedCount = ranked.filter(parcel=>stageFor(parcel.id)==="passed").length;
  const newSites = useMemo(()=>ranked.filter(parcel=>{
    const stage=stageFor(parcel.id);
    const stageMatch=newListFilter==="all"?["new","passed"].includes(stage):newListFilter==="passed"?stage==="passed":stage==="new";
    const haystack=`${parcel.id} ${parcel.state} ${parcel.county} ${parcel.address} ${parcel.owner} ${parcel.zoning} ${parcel.flags.join(" ")}`.toLowerCase();
    return stageMatch&&haystack.includes(query.toLowerCase());
  }),[ranked,workflows,newListFilter,query]);
  const totalWeight = Object.values(weights).reduce((sum,value)=>sum+value,0);

  useEffect(()=>{
    if (screenFive[0]) setSelected(screenFive[0]);
  },[geoState,geoArea]);

  const setParcelWorkflow = (parcelId:string,stage:Stage,nextAction="") => {
    const workflow={parcelId,stage,nextAction,updatedAt:new Date().toISOString()};
    setWorkflows(current=>({...current,[parcelId]:workflow}));
    fetch("/api/model",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({type:"workflow",parcelId,stage,nextAction})}).catch(()=>{});
  };

  const saveWeights = (next:Record<ScoreKey,number>) => {
    setWeights(next);
    fetch("/api/model",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({type:"weights",weights:next})}).catch(()=>{});
  };

  const openParcel = (parcel:Parcel,nextTab="Screen") => {
    setSelected(parcel);
    setTab(nextTab);
  };

  const exportCsv = () => {
    const rows=[
      ["parcel_id","stage","state","county","address","owner","mailing_address","lot_sf","land_assessment","improvement_assessment","base_score","outreach_intelligence","current_score","next_action","source_url"],
      ...ranked.map(parcel=>[parcel.id,stageFor(parcel.id),parcel.state,parcel.county,parcel.address,parcel.owner,parcel.mailing,parcel.lot,parcel.land,parcel.improvement,baseScore(parcel,weights),outreachIntelligence(parcel.id,logs),score(parcel,weights,logs),workflows[parcel.id]?.nextAction||"",parcel.sourceUrl]),
    ];
    const csv=rows.map(row=>row.map(value=>`"${String(value??"").replaceAll('"','""')}"`).join(",")).join("\n");
    const link=document.createElement("a");
    link.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    link.download="mat-disanto-deal-screener.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const submitOutreach = (event:FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    const parcelId=String(form.get("parcel"));
    const rating=Number(form.get("rating"));
    const disposition=String(form.get("disposition"));
    const stage:Stage=disposition==="auto"?(rating>=4?"pipeline":rating<=2?"passed":"screening"):disposition as Stage;
    const iso=String(form.get("date"));
    const log:OutreachLog={
      date:new Date(`${iso}T12:00:00`).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}),
      parcel:parcelId,method:String(form.get("method")),response:String(form.get("response")),motivation:String(form.get("motivation")),next:String(form.get("next")),rating,
    };
    const workflow={parcelId,stage,nextAction:log.next,updatedAt:new Date().toISOString()};
    setLogs(current=>[log,...current]);
    setWorkflows(current=>({...current,[parcelId]:workflow}));
    fetch("/api/model",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({contactDate:log.date,parcelId,method:log.method,response:log.response,motivation:log.motivation,nextAction:log.next,rating,stage})}).catch(()=>{});
    setShowLog(false);
    setTab(stage==="pipeline"?"Keep List":"Screen");
  };

  const selectedHistory=parcelLogs(selected.id,logs);
  const selectedChange=scoreChange(selected,weights,logs);

  return <main>
    <header>
      <div className="brand"><span className="mark">MD</span><div><strong>Matt&apos;s Deal Screener</strong><small>NJ + Chester County PA</small></div></div>
      <nav>{["Screen","Keep List","Screened","New Sites","Outreach","Scoring"].map(item=><button className={tab===item?"active":""} onClick={()=>setTab(item)} key={item}>{item}{item==="Screen"&&<b>{screenFive.length}</b>}{item==="Keep List"&&pipeline.length>0&&<b>{pipeline.length}</b>}{item==="Screened"&&previouslyScreened.length>0&&<b>{previouslyScreened.length}</b>}</button>)}</nav>
      <div className="headerRight"><span className="live">● Saved workflow</span><span className="avatar">MD</span></div>
    </header>

    {tab==="Screen"&&<>
      <section className="hero compactHero"><div><p className="eyebrow">TODAY’S COMBINED SCREEN</p><h1>The five best current choices.</h1><p>Fresh sites and previously screened sites compete together using their current feedback-adjusted scores.</p></div></section>
      <section className="loopSteps"><div><b>1</b><span><strong>Screen five</strong><small>Highest public-record scores</small></span></div><i>→</i><div><b>2</b><span><strong>Select Keep</strong><small>Save the sites worth pursuing</small></span></div><i>→</i><div><b>3</b><span><strong>Reach ownership</strong><small>Log comments + 1–5 signal</small></span></div><i>→</i><div><b>4</b><span><strong>Re-rank Keep List</strong><small>Scores update from feedback</small></span></div></section>
      <section className="geoBar"><div><label>State<select aria-label="Filter top five by state" value={geoState} onChange={event=>{setGeoState(event.target.value as "all"|"NJ"|"PA");setGeoArea("all")}}><option value="all">All regions</option><option value="NJ">New Jersey</option><option value="PA">Pennsylvania</option></select></label><label className={geoState==="all"?"disabled":""}>{geoState==="NJ"?"County":geoState==="PA"?"Town":"County / town"}<select aria-label={geoState==="NJ"?"Filter by New Jersey county":"Filter by Chester County town"} value={geoArea} disabled={geoState==="all"} onChange={event=>setGeoArea(event.target.value)}><option value="all">{geoState==="NJ"?"All NJ counties":geoState==="PA"?"All Chester County towns":"Select a state first"}</option>{geoAreas.map(area=><option value={area} key={area}>{area}</option>)}</select></label></div><span>Ranking {geographyPool.length} eligible {geographyPool.length===1?"site":"sites"} by live KE score · data checked {refreshStatus.lastChecked}</span></section>
      <section className="sectionHead"><div><h2>Top five current choices</h2><p>A previously screened 80 outranks a fresh 79; fresh 85s still take priority.</p></div><span className="updated">{geographyPool.length} eligible in this geography</span></section>
      <div className="workspace"><div className="cards">{screenFive.map((parcel,index)=><button key={parcel.id} className={`target ${selected.id===parcel.id?"selected":""}`} onClick={()=>setSelected(parcel)}><span className="rank">{index+1}</span><div className="targetMain"><div><span className="parcelId">{parcel.id}</span><span className={`status stage-${stageFor(parcel.id)}`}>{stageLabel(stageFor(parcel.id))}</span></div><h3>{parcel.address}</h3><p>{parcel.owner} · {parcel.ownerType}</p><p className="reason">{parcel.reason}</p><div className="chips">{parcel.flags.slice(0,3).map(flag=><span key={flag}>{flag}</span>)}</div></div><div className="score"><strong>{score(parcel,weights,logs)}</strong><span>KE SCORE</span>{scoreChange(parcel,weights,logs)!==0&&<em className={scoreChange(parcel,weights,logs)>0?"positive":"negative"}>{scoreChange(parcel,weights,logs)>0?"+":""}{scoreChange(parcel,weights,logs)} feedback</em>}</div></button>)}{screenFive.length===0&&<div className="empty"><strong>No eligible sites in this geography.</strong><span>Choose a broader state, county, or town.</span></div>}</div>
        <aside><div className="asideTop"><div><span className="parcelId">PARCEL {selected.id}</span><h2>{selected.address}</h2><p>{selected.owner}</p></div><button onClick={()=>setShowLog(true)}>Log feedback</button></div>
          <div className="scoreSummary"><div className="scoreRing"><strong>{score(selected,weights,logs)}</strong><span>CURRENT<br/>KE SCORE</span></div><div><span>Initial screen</span><strong>{baseScore(selected,weights)}</strong><span>Owner feedback</span><strong className={selectedChange>0?"positive":selectedChange<0?"negative":""}>{selectedChange>0?"+":""}{selectedChange}</strong><small>{selectedHistory.length?`${selectedHistory.length} outreach ${selectedHistory.length===1?"entry":"entries"}`:"No owner feedback yet"}</small></div></div>
          <div className="breakdown">{scoreKeys.map(key=><div key={key}><span>{labels[key]} <em>{weights[key]}%</em></span><div><i style={{width:`${factorValue(selected,key,logs)}%`}}/></div><b>{factorValue(selected,key,logs)}</b></div>)}</div>
          <div className="angle"><span>SUGGESTED OUTREACH ANGLE</span><p>“{selected.angle}”</p></div>
          <div className="workflowControl"><label>Move this site<select aria-label="Move selected site" value={stageFor(selected.id)} onChange={event=>setParcelWorkflow(selected.id,event.target.value as Stage,workflows[selected.id]?.nextAction)}><option value="new">Fresh / not screened</option><option value="screening">Previously screened · still eligible</option><option value="pipeline">Keep list</option><option value="passed">Passed</option></select></label><small>Previously Screened stays eligible for the top five at its feedback-adjusted score. Keep remains a separate list.</small></div>
          <dl><div><dt>Lot / building</dt><dd>{selected.lot?selected.lot.toLocaleString():"Not supplied"} / {selected.building?selected.building.toLocaleString():"Not supplied"} sf</dd></div><div><dt>Built / zoning</dt><dd>{selected.year||"Unknown"} · {selected.zoning}</dd></div><div><dt>Assessed value</dt><dd>{money(selected.land)} land · {money(selected.improvement)} improvements</dd></div><div><dt>Tax / approvals</dt><dd>{selected.delinquency} · {selected.approvals}</dd></div><div><dt>Owner mailing</dt><dd>{selected.mailing}</dd></div></dl>
          <div className="sourceBox"><span>PUBLIC RECORD SOURCE</span><a href={selected.sourceUrl} target="_blank" rel="noreferrer">{selected.sourceName} ↗</a><small>{selected.sourceDate} · checked {selected.sourceChecked}</small><p>{selected.sourceNote}</p></div>
        </aside></div>
    </>}

    {tab==="Keep List"&&<section className="page"><div className="pageTitle"><div><p className="eyebrow">SITES WORTH PURSUING</p><h1>Keep List</h1><p>Your selected properties, continuously re-ranked as owner feedback changes their scores.</p></div><button onClick={exportCsv}>Export all data</button></div>
      {pipeline.length===0?<div className="emptyState"><strong>No properties on the Keep List yet.</strong><span>Use the selector on the Screen or New Sites tab to keep a property.</span><button onClick={()=>setTab("Screen")}>Review today’s five</button></div>:<div className="tableWrap"><table><thead><tr><th>Keep rank / property</th><th>Owner</th><th>Live score</th><th>Owner signal</th><th>Latest comments</th><th>Next action</th><th>List</th><th></th></tr></thead><tbody>{pipeline.map((parcel,index)=>{const history=parcelLogs(parcel.id,logs);const latest=history[0];return <tr key={parcel.id}><td><b>#{index+1} · {parcel.address}</b><span>{parcel.id} · {parcel.county}, {parcel.state}</span></td><td>{parcel.owner}<span>{parcel.ownerType}</span></td><td><strong className="tableScore">{score(parcel,weights,logs)}</strong><span>{scoreChange(parcel,weights,logs)>=0?"+":""}{scoreChange(parcel,weights,logs)} from feedback</span></td><td>{outreachIntelligence(parcel.id,logs)}/100<span>{history.length} logged contact{history.length===1?"":"s"}</span></td><td>{latest?.response||"No comments yet"}<span>{latest?.motivation}</span></td><td>{workflows[parcel.id]?.nextAction||latest?.next||"Define next action"}</td><td><select className="workflowSelect" aria-label={`Move ${parcel.address}`} value={stageFor(parcel.id)} onChange={event=>setParcelWorkflow(parcel.id,event.target.value as Stage,workflows[parcel.id]?.nextAction)}><option value="screening">Screening</option><option value="pipeline">Keep</option><option value="passed">Passed</option></select></td><td><button className="tableButton" onClick={()=>{setSelected(parcel);setShowLog(true)}}>Log feedback</button></td></tr>})}</tbody></table></div>}
    </section>}

    {tab==="Screened"&&<section className="page"><div className="pageTitle"><div><p className="eyebrow">FEEDBACK RECEIVED · STILL ELIGIBLE</p><h1>Previously Screened</h1><p>These are not on the Keep List. Their adjusted scores continue competing with fresh sites for the top five.</p></div><button onClick={exportCsv}>Export all data</button></div>
      {previouslyScreened.length===0?<div className="emptyState"><strong>No sites are waiting here yet.</strong><span>After outreach, choose “Previously screened · still eligible” to preserve a site at its updated score.</span><button onClick={()=>setTab("Screen")}>Review today’s five</button></div>:<div className="tableWrap"><table><thead><tr><th>Screened rank / property</th><th>Current position</th><th>Initial score</th><th>Adjusted score</th><th>Latest feedback</th><th>Next action</th><th>Move site</th><th></th></tr></thead><tbody>{previouslyScreened.map((parcel,index)=>{const history=parcelLogs(parcel.id,logs);const latest=history[0];const activeRank=activeSites.findIndex(item=>item.id===parcel.id)+1;return <tr key={parcel.id}><td><b>#{index+1} · {parcel.address}</b><span>{parcel.id} · {parcel.owner}</span></td><td>{activeRank<=5?<b className="positive">Top five · #{activeRank}</b>:<b>Waiting · #{activeRank}</b>}<span>among fresh + screened</span></td><td>{baseScore(parcel,weights)}</td><td><strong className="tableScore">{score(parcel,weights,logs)}</strong><span className={scoreChange(parcel,weights,logs)>0?"positive":scoreChange(parcel,weights,logs)<0?"negative":""}>{scoreChange(parcel,weights,logs)>=0?"+":""}{scoreChange(parcel,weights,logs)} from feedback</span></td><td>{latest?.response||"No comments available"}<span>{latest?.motivation} · {latest?.rating}/5 signal</span></td><td>{workflows[parcel.id]?.nextAction||latest?.next||"Define next action"}</td><td><select className="workflowSelect" aria-label={`Move ${parcel.address}`} value={stageFor(parcel.id)} onChange={event=>setParcelWorkflow(parcel.id,event.target.value as Stage,workflows[parcel.id]?.nextAction)}><option value="screening">Previously screened</option><option value="pipeline">Keep</option><option value="passed">Passed</option></select></td><td><button className="tableButton" onClick={()=>{setSelected(parcel);setShowLog(true)}}>Log feedback</button></td></tr>})}</tbody></table></div>}
    </section>}

    {tab==="New Sites"&&<section className="page"><div className="pageTitle"><div><p className="eyebrow">NEVER SCREENED</p><h1>New site data</h1><p>Fresh public-record candidates. Once you log feedback, they move to Keep, Previously Screened, or Passed.</p></div><button onClick={exportCsv}>Export all data</button></div>
      <section className="workbar inline"><input aria-label="Search new sites" placeholder="Search parcel, owner, address or municipality…" value={query} onChange={event=>setQuery(event.target.value)}/><div className="segmented"><button className={newListFilter==="active"?"selected":""} onClick={()=>setNewListFilter("active")}>Fresh {freshSites.length}</button><button className={newListFilter==="passed"?"selected":""} onClick={()=>setNewListFilter("passed")}>Passed {passedCount}</button><button className={newListFilter==="all"?"selected":""} onClick={()=>setNewListFilter("all")}>Fresh + passed</button></div><span>{newSites.length} rows</span></section>
      <div className="tableWrap"><table><thead><tr><th>Rank / property</th><th>Owner</th><th>Public-record signal</th><th>Move site</th><th>Initial score</th><th>Current score</th><th></th></tr></thead><tbody>{newSites.map((parcel,index)=><tr key={parcel.id}><td><b>#{index+1} · {parcel.address}</b><span>{parcel.id} · {parcel.county}, {parcel.state}</span></td><td>{parcel.owner}<span>{parcel.ownerType}</span></td><td>{parcel.reason}<span>{parcel.sourceName}</span></td><td><select className="workflowSelect" aria-label={`Move ${parcel.address}`} value={stageFor(parcel.id)} onChange={event=>setParcelWorkflow(parcel.id,event.target.value as Stage,workflows[parcel.id]?.nextAction)}><option value="new">New</option><option value="screening">Screening</option><option value="pipeline">Keep</option><option value="passed">Passed</option></select></td><td>{baseScore(parcel,weights)}</td><td><strong className="tableScore">{score(parcel,weights,logs)}</strong><span>{parcelLogs(parcel.id,logs).length?`${outreachIntelligence(parcel.id,logs)}/100 outreach intelligence`:"No owner feedback"}</span></td><td><button className="tableButton" onClick={()=>openParcel(parcel)}>Review</button></td></tr>)}</tbody></table></div>
    </section>}

    {tab==="Outreach"&&<section className="page"><div className="pageTitle"><div><p className="eyebrow">YOUR FIELD INTELLIGENCE</p><h1>Outreach log</h1><p>Written comments and outcome ratings are the recursive input to the score.</p></div><button onClick={()=>setShowLog(true)}>+ Log outreach</button></div>
      <div className="callout"><strong>{logs.length?`${logs.length} owner contact ${logs.length===1?"entry":"entries"}`:"No outreach logged yet"}</strong><span>Each parcel’s 1–5 ratings are averaged and mapped transparently to an outreach-intelligence score of 10, 30, 50, 75 or 95.</span></div>
      <div className="tableWrap"><table><thead><tr><th>Contact date</th><th>Property</th><th>Method</th><th>Your comments</th><th>Owner motivation</th><th>Next action</th><th>Signal</th><th>Score impact</th></tr></thead><tbody>{logs.map((log,index)=>{const parcel=parcels.find(item=>item.id===log.parcel);return <tr key={log.id||`${log.parcel}-${index}`}><td>{log.date}</td><td><b>{parcel?.address||log.parcel}</b><span>{log.parcel}</span></td><td>{log.method}</td><td>{log.response}</td><td>{log.motivation}</td><td>{log.next}</td><td><span className={`rating rating-${log.rating}`}>{log.rating}/5</span></td><td>{parcel&&<><b className={scoreChange(parcel,weights,logs)>0?"positive":scoreChange(parcel,weights,logs)<0?"negative":""}>{scoreChange(parcel,weights,logs)>0?"+":""}{scoreChange(parcel,weights,logs)}</b><span>current cumulative impact</span></>}</td></tr>})}</tbody></table></div>
    </section>}

    {tab==="Scoring"&&<section className="page scoringPage"><div className="pageTitle"><div><p className="eyebrow">TRANSPARENT RECURSIVE MODEL</p><h1>Scoring logic</h1><p>Public-record evidence starts the score. Your owner feedback changes it.</p></div><button onClick={()=>saveWeights(initialWeights)}>Reset defaults</button></div>
      <div className="weightGrid"><div className="weightPanel"><h2>Knowledge Equity Score</h2><p>Weighted sum of five 0–100 factors. Keep the total at 100%.</p>{scoreKeys.map(key=><label key={key}><span>{labels[key]}<small>{factorHelp[key]}</small></span><input aria-label={`${labels[key]} weight`} type="range" min="0" max="50" value={weights[key]} onChange={event=>saveWeights({...weights,[key]:Number(event.target.value)})}/><b>{weights[key]}%</b></label>)}<div className={`total ${totalWeight===100?"valid":"invalid"}`}><span>Total model weight</span><strong>{totalWeight}%</strong><small>{totalWeight===100?"✓ Ready to rank":"Adjust to exactly 100%"}</small></div></div>
        <div><div className="learning"><span>OUTREACH RECURSION</span><h2>How your rating updates a property</h2><div className="ratingMap">{Object.entries(ratingToIntelligence).map(([rating,value])=><span key={rating}><b>{rating}/5</b><i>→</i><strong>{value}</strong><small>intelligence</small></span>)}</div><p>Multiple contacts are averaged for that parcel. The result replaces the neutral 50 outreach factor; every ranking then recalculates with your current outreach-intelligence weight.</p></div><div className="formula"><span>LIVE FORMULA · {selected.address}</span><code>{scoreKeys.map(key=>`${factorValue(selected,key,logs)} × ${weights[key]}%`).join("  +  ")}</code><strong>= {score(selected,weights,logs)}</strong><small>Initial {baseScore(selected,weights)} · owner feedback {selectedChange>=0?"+":""}{selectedChange} · {selectedHistory.length} logged contact{selectedHistory.length===1?"":"s"}</small></div></div></div>
    </section>}

    {showLog&&<div className="modalBack" onClick={()=>setShowLog(false)}><form className="modal" onClick={event=>event.stopPropagation()} onSubmit={submitOutreach}><button type="button" className="close" onClick={()=>setShowLog(false)}>×</button><p className="eyebrow">OWNER FEEDBACK</p><h2>Log outreach</h2><p>Your comments, rating and disposition update this property immediately.</p><div className="formGrid">
      <label className="wide">Property<select name="parcel" defaultValue={selected.id} required>{parcels.map(parcel=><option key={parcel.id} value={parcel.id}>{parcel.address} · {parcel.owner}</option>)}</select></label>
      <label>Contact date<input name="date" type="date" defaultValue="2026-08-08" required/></label><label>Method<select name="method" defaultValue="Phone"><option>Phone</option><option>Email</option><option>Letter</option><option>In person</option></select></label>
      <label className="wide">Conversation notes<textarea name="response" placeholder="What did the owner say? What changed your view?" required/></label><label className="wide">Owner motivation / constraints<textarea name="motivation" placeholder="Timing, price expectations, partnership issues, tax concerns, retirement, no interest…" required/></label>
      <label>Next action<input name="next" placeholder="Call again, send option terms, research zoning…" required/></label><label>Owner signal<select name="rating" defaultValue="3"><option value="1">1 — Strong no / bad fit</option><option value="2">2 — Unfavorable</option><option value="3">3 — Neutral / unknown</option><option value="4">4 — Favorable</option><option value="5">5 — Strong interest</option></select></label>
      <label className="wide">Disposition<select name="disposition" defaultValue="auto"><option value="auto">Automatic: 4–5 Keep · 1–2 Pass · 3 Previously Screened</option><option value="screening">Previously Screened · remain top-five eligible</option><option value="pipeline">Move to Keep List</option><option value="passed">Pass / archive</option></select><small className="fieldHint">Override Automatic when feedback is negative but you still want the adjusted site competing in future screens.</small></label>
    </div><div className="modalActions"><button type="button" onClick={()=>setShowLog(false)}>Cancel</button><button type="submit">Save and update score</button></div></form></div>}
  </main>;
}
