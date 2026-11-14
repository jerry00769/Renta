/* Extra Renta: čistě prohlížečová vrstva, bez Flask/Python. */
(()=>{'use strict';
const nativeFetch=window.fetch.bind(window),KEY='renta_web_v1',CFG='renta_github_config';
const DIRTY_KEY='renta_web_unsynced_v1',REMEMBER_KEY='renta_github_remember';
 let changeRevision=0;
 const syncState=(message,kind='info')=>window.dispatchEvent(new CustomEvent('renta-sync-status',{detail:{message,kind}}));
 const syncSignal=(ok,message='')=>window.dispatchEvent(new CustomEvent('renta-github-sync',{detail:{ok,message}}));
 const csv=(s,sep=';')=>s.replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(x=>x.split(sep));
const nums=x=>{let a=(Array.isArray(x)?x:String(x).split(',')).map(Number).sort((a,b)=>a-b);return a.length===7&&new Set(a).size===7&&a.every(n=>Number.isInteger(n)&&n>=1&&n<=33)?a:null};
const date=x=>{let s=String(x||'');let m=s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:s.slice(0,10)};
const defaultData=()=>({history:[],bets:[],predictions:[],version:1});
let hadLocalData=localStorage.getItem(KEY)!==null;let data=JSON.parse(localStorage.getItem(KEY)||'null')||defaultData();let cfg=JSON.parse(sessionStorage.getItem(CFG)||localStorage.getItem(CFG)||'{}');let sha=null;let dirty=localStorage.getItem(DIRTY_KEY)==='1';let syncing=false;let saveQueue=Promise.resolve();
// Zachovat starší uložený přístup; nové uložení respektuje volbu checkboxu.
if(cfg.owner&&cfg.repo&&cfg.token){sessionStorage.setItem(CFG,JSON.stringify(cfg));}
else{sessionStorage.removeItem(CFG);}
const persist=()=>{dirty=true;localStorage.setItem(DIRTY_KEY,'1');localStorage.setItem(KEY,JSON.stringify(data));syncState(config()?'místní změny čekají na odeslání':'místní změny, GitHub nepřipojen',config()?'info':'error');changeRevision++;scheduleLocalCsv();if(config())scheduleSave();};
// Lokální CSV se zapisují pouze při spuštění přes vlastní server (nikdy na GitHub Pages).
let localCsvTimer=null,localCsvQueue=Promise.resolve();
function localCsvEnabled(){return location.hostname==='127.0.0.1'&&location.port==='8765';}
function scheduleLocalCsv(){if(!localCsvEnabled())return;clearTimeout(localCsvTimer);localCsvTimer=setTimeout(()=>{localCsvQueue=localCsvQueue.then(writeLocalCsv).catch(e=>{console.warn('Lokální CSV:',e.message);syncState('Lokální CSV: '+e.message,'error');});},450);}
async function writeLocalCsv(){
 for(const [name,content] of [['renta.csv',formatHistory()],['vsazene_kombinace.csv',formatBets()],['renta_predikce.csv',formatPredictions()]]){
  const r=await nativeFetch('/api/write-csv',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,content})});
  if(!r.ok)throw Error(name+' HTTP '+r.status);
 }
}
const sortedBets=()=>[...data.bets].sort((a,b)=>date(b.Datum_sazky).localeCompare(date(a.Datum_sazky))||(+a.Poradi||0)-(+b.Poradi||0));
const drawMap=()=>new Map(data.history.map(x=>[date(x.date),x.numbers]));
function parseHistory(s){let rows=csv(s);if(rows[0]?.[0]?.toLowerCase()!=='datum')throw Error('Chybná hlavička renta.csv');let out=[];for(let r of rows.slice(1)){let n=nums(r.slice(1));if(!n||!date(r[0]))throw Error('Neplatný řádek historie');out.push({date:date(r[0]),numbers:n});}return [...new Map(out.map(r=>[r.date,r])).values()];}
function parseBets(s){let rows=csv(s);return rows.slice(1).filter(r=>r.length>=6&&nums(r[1])).map(r=>Object.fromEntries(['Datum_sazky','Kombinace','Cena','Vyhodnoceni','Shodna_cisla','Poradi'].map((k,i)=>[k,r[i]])));}
const formatBets=()=>['Datum_sazky;Kombinace;Cena;Vyhodnoceni;Shodna_cisla;Poradi',...sortedBets().map(b=>['Datum_sazky','Kombinace','Cena','Vyhodnoceni','Shodna_cisla','Poradi'].map(k=>String(b[k]??'').replaceAll(';',',')).join(';'))].join('\r\n')+'\r\n';
async function seed(){if(data.history.length)return;try{if(window.RENTA_INITIAL_DATA){data.history=parseHistory(window.RENTA_INITIAL_DATA.history);data.bets=parseBets(window.RENTA_INITIAL_DATA.bets);localStorage.setItem(KEY,JSON.stringify(data));return;}let h=await nativeFetch('./renta.csv');if(h.ok)data.history=parseHistory(await h.text());let b=await nativeFetch('./vsazene_kombinace.csv');if(b.ok)data.bets=parseBets(await b.text());localStorage.setItem(KEY,JSON.stringify(data));}catch(e){console.warn(e)}}
function stats(){let single=Array(34).fill(0),pairs=new Map(),triples=new Map(),feedback=Array(34).fill(0),total=Array(34).fill(0),known=drawMap(),checked=0;
for(let h of data.history){let a=h.numbers;for(let i=0;i<7;i++){single[a[i]]++;for(let j=i+1;j<7;j++){let p=`${a[i]},${a[j]}`;pairs.set(p,(pairs.get(p)||0)+1);for(let k=j+1;k<7;k++){let t=`${p},${a[k]}`;triples.set(t,(triples.get(t)||0)+1)}}}}
for(let b of data.bets){let draw=known.get(date(b.Datum_sazky)),a=nums(b.Kombinace);if(!draw||!a)continue;checked++;for(let n of a){total[n]++;if(draw.includes(n))feedback[n]++}}
let count=data.history.length, norm=(n,e)=>Math.max(-1,Math.min(1,(n-e)/Math.sqrt(e+4)/3));return {single:single.map(n=>norm(n,count*7/33)),pairs,triples,feedback:feedback.map((n,i)=>Math.max(-1,Math.min(1,(n-total[i]*7/33)/(3+Math.sqrt(total[i]))))),count,checked,norm,pairExpected:count*42/(33*32),tripleExpected:count*210/(33*32*31)};}
function score(a,s){let s1=a.reduce((v,n)=>v+s.single[n],0)/7,s2=0,s3=0;for(let i=0;i<7;i++)for(let j=i+1;j<7;j++){let p=`${a[i]},${a[j]}`;s2+=s.pairs.has(p)?s.norm(s.pairs.get(p),s.pairExpected):0;for(let k=j+1;k<7;k++)s3+=s.triples.has(`${p},${a[k]}`)?s.norm(s.triples.get(`${p},${a[k]}`),s.tripleExpected):0}s2/=21;s3/=35;let sf=a.reduce((v,n)=>v+s.feedback[n],0)/7,ev=a.filter(n=>n%2===0).length,con=a.filter((n,i)=>i&&n===a[i-1]+1).length,thirds=[a.filter(n=>n<=11).length,a.filter(n=>n>=12&&n<=22).length,a.filter(n=>n>=23).length];return .40*s1+.18*s2+.07*s3+.10*sf-.035*Math.abs(ev-3.5)-.05*Math.max(0,con-1)-.035*Math.max(0,Math.max(...thirds)-4)-.025*Math.max(0,a.filter(n=>n<=12).length-5)}
function generate(){if(!data.history.length)throw Error('Chybí historie losování.');let s=stats(),ranked=[],seen=new Set();for(let i=0;i<20000;i++){let pool=Array.from({length:33},(_,i)=>i+1);for(let j=0;j<7;j++){let k=j+Math.floor(Math.random()*(33-j));[pool[j],pool[k]]=[pool[k],pool[j]]}let a=pool.slice(0,7).sort((a,b)=>a-b),key=a.join(',');if(seen.has(key))continue;seen.add(key);ranked.push({a,v:score(a,s)})}ranked.sort((a,b)=>b.v-a.v);let selected=[],usage=Array(34).fill(0);for(let step=0;step<4;step++){let best=null,val=-Infinity;for(let item of ranked.slice(0,1200)){if(selected.some(a=>a.filter(n=>item.a.includes(n)).length>2))continue;let utility=item.v-.065*item.a.reduce((v,n)=>v+usage[n],0);if(utility>val){best=item.a;val=utility}}if(!best)throw Error('Nepodařilo se sestavit čtyři odlišné sloupce');selected.push(best);for(let n of best)usage[n]++}data.predictions=selected;persist();return s}
function evaluate(silent=false){let map=drawMap(),count=0;for(let b of data.bets){let draw=map.get(date(b.Datum_sazky)),a=nums(b.Kombinace);if(!draw||!a||!['','nev','nevyhodnoceno'].includes(String(b.Vyhodnoceni||'').toLowerCase()))continue;let matches=a.filter(n=>draw.includes(n)),c=matches.length,word=c===1?'shoda':c>=2&&c<=4?'shody':'shod',base=c===7?'Hlavní Výhra':c>=3?'Výhra':'Prohra';b.Shodna_cisla=matches.join(',');b.Vyhodnoceni=c===7?base:c?`${base} (${c} ${word})`:'Prohra';count++}if(count&&!silent)persist();return count}
function config(){return cfg.owner&&cfg.repo&&cfg.token}
function mergeHistory(rows){let m=new Map(data.history.map(x=>[date(x.date),x]));let added=0;for(let x of rows){let key=date(x.date);if(!m.has(key)){m.set(key,x);added++}}if(added){data.history=[...m.values()].sort((a,b)=>date(a.date).localeCompare(date(b.date)));evaluate(true);localStorage.setItem(KEY,JSON.stringify(data));}return added}
async function refreshHistory(){// Veřejná renta.csv je zdrojem historie; nikdy nemaže starší místní tahy.
 if(location.protocol==='file:')return 0;
 let r=await nativeFetch('./renta.csv?ts='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('Historii renta.csv nelze načíst (HTTP '+r.status+').');
 const added=mergeHistory(parseHistory(await r.text()));if(added)scheduleLocalCsv();return added;}
let saveTimer=null;
function scheduleSave(){if(!config())return;clearTimeout(saveTimer);saveTimer=setTimeout(()=>{saveQueue=saveQueue.then(()=>autoSave()).catch(e=>{console.warn('GitHub synchronizace:',e.message);let el=document.getElementById('renta-sync-warning');if(el)el.textContent='⚠ GitHub: '+e.message;syncState('chyba synchronizace: '+e.message,'error');});},900)}
async function autoSave(){if(!config()||syncing||!dirty)return;syncing=true;const sendingRevision=changeRevision;syncState('odesílám změny…');try{if(sha===null){let latest=await remote();if(latest){sha=latest.sha;let other=JSON.parse(decode(latest.content));if(JSON.stringify(other.bets)!==JSON.stringify(data.bets)||JSON.stringify(other.predictions)!==JSON.stringify(data.predictions)){throw Error('Společná data se liší: před uložením načti GitHub. Místní data zůstala zachována.')}}}await push();if(changeRevision===sendingRevision){dirty=false;localStorage.removeItem(DIRTY_KEY);syncSignal(true);syncState('data synchronizována','ok')}else{dirty=true;localStorage.setItem(DIRTY_KEY,'1');syncState('místní změny čekají na odeslání');scheduleSave()}}finally{syncing=false}}

async function remote(method='GET',payload){if(!config())throw Error('Nejdříve nastav GitHub přístup.');let path=cfg.path||'renta-data.json',url=`https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`,r=await nativeFetch(url,{method,headers:{Authorization:`Bearer ${cfg.token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})});let j=await r.json();if(!r.ok){if(r.status===404&&method==='GET'){syncSignal(false,'GitHub API 404: společný JSON není dostupný.');return null;}if(r.status===409||r.status===422){syncSignal(false,'Konflikt GitHub.');throw Error('Konflikt GitHub: data se mezitím změnila. Načti společnou verzi a změnu zopakuj.');}syncSignal(false,j.message||`GitHub HTTP ${r.status}`);throw Error(j.message||`GitHub HTTP ${r.status}`)}return j}
const decode=s=>new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g,'')),c=>c.charCodeAt(0)));
const encode=s=>btoa(Array.from(new TextEncoder().encode(s),c=>String.fromCharCode(c)).join(''));
async function pull(force=false){if(dirty&&!force)throw Error('Místní změny nejsou synchronizované. Nejprve exportuj zálohu JSON nebo zvol bezpečné řešení konfliktu.');let j=await remote();if(!j){sha=null;return false}let d=JSON.parse(decode(j.content));if(!Array.isArray(d.history)||!Array.isArray(d.bets))throw Error('Neplatná struktura sdílených dat');let localHistory=data.history||[];if(dirty&&data.bets.length&&JSON.stringify(data.bets)!==JSON.stringify(d.bets))throw Error('Místní a společné sázky se liší. Automatické načtení zastaveno; nejdřív exportuj zálohu JSON a změny porovnej.');data=d;sha=j.sha;dirty=false;localStorage.removeItem(DIRTY_KEY);localStorage.setItem(KEY,JSON.stringify(data));mergeHistory(localHistory);evaluate(true);localStorage.setItem(KEY,JSON.stringify(data));scheduleLocalCsv();syncSignal(true);syncState('data synchronizována','ok');return true}
async function push(){let latest=await remote();if((latest?.sha||null)!==sha)throw Error('Konflikt: vzdálená data byla změněna. Nejdřív načti společnou verzi.');let j=await remote('PUT',{message:'Extra Renta: synchronizace dat',content:encode(JSON.stringify(data,null,2)),...(sha?{sha}:{})});sha=j.content.sha;dirty=false;localStorage.removeItem(DIRTY_KEY);syncSignal(true);syncState('data synchronizována','ok')}
function jsonResponse(o,status=200){return Promise.resolve(new Response(JSON.stringify(o),{status,headers:{'Content-Type':'application/json'}}))}
async function handle(url,options={}){await ready;let path='/app/'+String(url).split('/app/').pop().split(/[?#]/)[0],body=options.body?JSON.parse(options.body):{};try{let result={status:'ok'};switch(path){case '/app/update_prediction':{let i=Number(body.index),a=body.numbers;if(!Number.isInteger(i)||i<0||i>=data.predictions.length||!Array.isArray(a)||a.length>7||new Set(a).size!==a.length||!a.every(n=>Number.isInteger(n)&&n>=1&&n<=33))throw Error('Neplatná úprava kombinace.');data.predictions[i]=[...a].sort((x,y)=>x-y);persist();result={status:'ok'};break}case '/app/get_latest_predictions':result={predictions:data.predictions};break;case '/app/get_staked_history':result={status:'ok',history:sortedBets().map(({Poradi,...r})=>r)};break;case '/app/get_staked_status':result={needs_evaluation:data.bets.some(b=>drawMap().has(date(b.Datum_sazky))&&['','nev','nevyhodnoceno'].includes(String(b.Vyhodnoceni||'').toLowerCase()))?'True':'False'};break;case '/app/generate_new_predictions':{let s=generate();result={status:'ok',message:`Generování predikcí dokončeno. SMART HYBRID: ${s.count} tahů, ${s.checked} ověřených sázek.`};break}case '/app/save_staked':{let d=body.date,combinations=body.combinations||[];if(!d||!combinations.length)throw Error('Chybí datum nebo kombinace.');for(let [i,c] of combinations.entries())if(!nums(c))throw Error('Kombinace '+(i+1)+': musí obsahovat přesně 7 různých čísel.');data.bets=data.bets.filter(b=>date(b.Datum_sazky)!==date(d));let existing=new Set(data.bets.filter(b=>['','nev','nevyhodnoceno'].includes(String(b.Vyhodnoceni||'').toLowerCase())).map(b=>b.Kombinace));let saved=0,rejected=0;for(let [i,c] of combinations.entries()){let n=nums(c);if(!n)throw Error('Neplatná kombinace.');let key=n.join(',');if(existing.has(key)){rejected++;continue}existing.add(key);data.bets.push({Datum_sazky:d,Kombinace:key,Cena:'0',Vyhodnoceni:'Nevyhodnoceno',Shodna_cisla:'',Poradi:i+1});saved++}persist();result={status:'ok',message:`Úspěšně uloženo ${saved} sázek pro datum ${d}.`+(rejected?` Odmítnuto ${rejected} duplicit.`:'')};break}case '/app/evaluate_staked':{let n=evaluate();result={status:'ok',message:n?`Vsazené sázky byly úspěšně vyhodnoceny. Vyhodnoceno ${n} nových sázek.`:'Nebyly nalezeny žádné nové sázky k vyhodnocení.'};break}case '/app/delete_staked':{let before=data.bets.length;data.bets=data.bets.filter(b=>date(b.Datum_sazky)!==date(body.date));persist();result={status:'ok',message:`Úspěšně smazáno ${before-data.bets.length} sázek pro datum ${body.date}.`};break}case '/app/restore_staked_history':data.bets=(body.history_data||[]).map((b,i)=>({...b,Poradi:b.Poradi||i+1}));persist();result={status:'ok',message:'Historie sázek byla úspěšně obnovena.'};break;case '/app/run_kontrola':{let wins=data.bets.filter(b=>String(b.Vyhodnoceni).includes('Výhra'));result={status:'ok',message:`Přehled výher a proher: ${wins.length} výherních sázek z ${data.bets.length}. Kontrola Excel XLSM není ve webové verzi dostupná.`};break}default:throw Error('Neznámá funkce: '+path)}return jsonResponse(result)}catch(e){return jsonResponse({status:'error',message:e.message},400)}}
const ready=seed();window.fetch=(url,options)=>String(url).includes('/app/')?handle(url,options):nativeFetch(url,options);
const formatHistory=()=>['Datum;sloupec 1;sloupec 2;sloupec 3;sloupec 4;sloupec 5;sloupec 6;sloupec 7',...data.history.slice().sort((a,b)=>date(b.date).localeCompare(date(a.date))).map(r=>[date(r.date).split('-').reverse().join('.'),...r.numbers].join(';'))].join('\r\n')+'\r\n';
const formatPredictions=()=>data.predictions.map(a=>a.join(',')).join('\r\n')+'\r\n';
function download(name,content){let a=document.createElement('a'),blob=new Blob([content],{type:'text/plain;charset=utf-8'});a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
// Bilance: skutečné částky pouze ze zadané ceny sloupce a potvrzených výplat.
function finance(){if(!data.finance||typeof data.finance!=='object')data.finance={};if(!data.finance.payouts||typeof data.finance.payouts!=='object')data.finance.payouts={};return data.finance}
const betId=b=>[date(b.Datum_sazky),nums(b.Kombinace)?.join(',')||b.Kombinace,String(b.Poradi||'')].join('|');
const money=n=>Number(n).toLocaleString('cs-CZ',{style:'currency',currency:'CZK'});
// Chronologický test bez použití budoucích tahů. Je to diagnostika četností,
// nikoli zpětný test náhodně generovaných SMART HYBRID kombinací.
function learningAudit(){
 const sample=data.history.filter(h=>nums(h.numbers)).slice().sort((a,b)=>date(a.date).localeCompare(date(b.date)));
 const start=Math.max(30,sample.length-40);let trials=0,longHits=0,recentHits=0;
 for(let i=start;i<sample.length;i++){
  const historical=Array(34).fill(0),recent=Array(34).fill(0);
  for(let j=0;j<i;j++)for(const n of sample[j].numbers){historical[n]++;if(j>=Math.max(0,i-30))recent[n]++;}
  const rank=(counts)=>Array.from({length:33},(_,k)=>k+1).sort((a,b)=>counts[b]-counts[a]||a-b).slice(0,7);
  const actual=new Set(sample[i].numbers);
  longHits+=rank(historical).filter(n=>actual.has(n)).length;
  recentHits+=rank(recent).filter(n=>actual.has(n)).length;
  trials++;
 }
 return {trials,longAvg:trials?longHits/trials:0,recentAvg:trials?recentHits/trials:0,randomAvg:49/33};
}

function financeDialog(){let dlg=document.getElementById('renta-finance-dialog');if(dlg)return dlg;
 dlg=document.createElement('dialog');dlg.id='renta-finance-dialog';dlg.style.cssText='background:#17243b;color:#e7f0ff;border:1px solid #54739c;border-radius:12px;padding:16px;width:min(570px,calc(100vw - 30px));max-height:85vh;overflow:auto;box-shadow:0 15px 55px #000a;font:13px Arial,sans-serif';
 if(!document.getElementById('renta-fin-style')){const style=document.createElement('style');style.id='renta-fin-style';style.textContent='#renta-finance-dialog::backdrop{background:rgba(0,0,0,.78)}#renta-finance-dialog{background:#242e48!important;border-color:#52617f!important}#renta-finance-dialog .renta-fin-row{display:flex;justify-content:space-between;align-items:center;gap:12px;background:#303b58;border:1px solid #465879;border-radius:5px;padding:11px;margin:7px 0}#renta-finance-dialog .renta-fin-row strong{text-align:right}#renta-finance-dialog h3{color:#a7c9ff;font-size:14px;margin:18px 0 8px}#renta-finance-dialog .renta-fin-chips{display:flex;gap:5px;flex-wrap:wrap}#renta-finance-dialog .renta-fin-chips span{border:1px solid #506a95;border-radius:3px;background:#334361;padding:4px 7px}#renta-finance-dialog .renta-fin-audit{display:grid;grid-template-columns:1fr 1fr;gap:8px}#renta-finance-dialog .renta-fin-audit>div{display:flex;flex-direction:column;gap:6px;padding:10px;background:#303b58;border:1px solid #465879;border-radius:5px}';document.head.append(style)}
 dlg.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;gap:15px"><h2 style="font-size:17px;margin:0;color:#8bb7f0">Automatická bilance sázek</h2><button type="button" id="renta-fin-close" style="padding:6px 12px">Zavřít ✕</button></div><div id="renta-fin-body" style="margin-top:16px"></div>';
 document.body.append(dlg);dlg.querySelector('#renta-fin-close').onclick=()=>dlg.close();dlg.addEventListener('click',e=>{if(e.target===dlg)dlg.close()});return dlg}
function renderFinance(){
 const dlg=financeDialog(),root=dlg.querySelector('#renta-fin-body'),f=finance();
 const bets=sortedBets(),draws=drawMap(),rules=window.RENTA_PAYOUTS||{};
 const tariff=rules.prizes25||{};
 let evaluated=0,winning=0,knownPayout=0,uncertain=0,missingCost=0,spent=0;
 const details=[];
 for(const bet of bets){
  const draw=draws.get(date(bet.Datum_sazky)),numbers=nums(bet.Kombinace);
  const id=betId(bet);
  const raw=String(bet.Cena??'').replace(/\s*Kč\s*/gi,'').replace(',','.').trim();
  const stated=Number(raw);const cost=(stated===25||stated===50)?stated:25;
  // Staré CSV obsahuje nulovou cenu: pro bilanci použijeme označený předpoklad 25 Kč.
  if(stated!==25&&stated!==50)missingCost++;
  spent+=cost;
  if(!draw||!numbers){details.push({bet,status:'Čeká na výsledek',cost});continue}
  evaluated++;
  const hits=numbers.filter(n=>draw.includes(n)).length;
  const manual=Object.hasOwn(f.payouts,id)?Number(f.payouts[id]):null;
  let value=0,status='Bez výhry';
  if(manual!==null&&Number.isFinite(manual)&&manual>=0){value=manual;status='Potvrzená částka'}
  else if(hits===6){uncertain++;status='6 shod – chybí dodatkové číslo pro určení pořadí'}
  else if(hits>=3){value=(Number(tariff[String(hits)])||0)*(cost/25);status='Tabulková výhra ('+hits+' shod)'}
  if(hits>=3)winning++;
  knownPayout+=value;
  details.push({bet,status,cost,value,hits});
 }
 const complete=uncertain===0&&evaluated===bets.length;
 const money=n=>Number(n).toLocaleString('cs-CZ',{style:'currency',currency:'CZK'});
 root.replaceChildren();
 const top=document.createElement('div');
 const row=(label,value)=>`<div class="renta-fin-row"><span>${label}</span><strong>${value}</strong></div>`;
 top.innerHTML=row('Vyhodnoceno',`${evaluated} sloupců; evidováno ${bets.length} sázek; bez výsledku ${bets.length-evaluated}`)+
 row('Výherní sloupce',`${winning} výher`)+
 row('Náklady',`${money(spent)}${missingCost?' (odhad)':''}`)+
 row('Tabulkové výhry',`${money(knownPayout)}${uncertain?' (neúplné)':''}`)+
 row('Čistá bilance',`${complete?money(knownPayout-spent):'zatím nelze určit přesně'}${complete&&missingCost?' (odhad)':''}`)+
 row('Návratnost',`${complete&&spent>0?(100*knownPayout/spent).toFixed(1).replace('.',',')+' %':'zatím nelze určit přesně'}`);
 root.append(top);
 const note=document.createElement('p');note.style.cssText='color:#ffcb7c;line-height:1.5';
 note.textContent=(missingCost?`${missingCost} sázek nemá uloženou cenu 25/50 Kč: počítám orientačně 25 Kč za sloupec. `:'')+(uncertain?`${uncertain} sázek se 6 shodami nelze přesně vyhodnotit bez dodatkového čísla. `:'')+(evaluated<bets.length?`${bets.length-evaluated} sázek čeká na výsledek. `:'')+'Výhry jsou hrubé tabulkové částky, nikoli potvrzení skutečně vyplacené výhry; daně a případné krácení rent nejsou započteny.';
 root.append(note);
 const section=document.createElement('details');section.style.marginTop='12px';
 const summary=document.createElement('summary');summary.textContent='Podrobnosti, zdroje a diagnostika';summary.style.cssText='cursor:pointer;color:#8bb7f0;font-weight:bold;padding:8px 0';section.append(summary);
 const audit=learningAudit(),statsData=stats();const content=document.createElement('div');content.style.lineHeight='1.7';
 const historyFrequency=Array(34).fill(0);
 for(const h of data.history){const a=nums(h.numbers);if(a)for(const n of a)historyFrequency[n]++}
 const frequencies=Array.from({length:33},(_,i)=>({n:i+1,count:historyFrequency[i+1]}));
 const chips=(arr)=>`<div class="renta-fin-chips">${arr.map(x=>`<span>${x.n} · ${x.count}×</span>`).join('')}</div>`;
 const freqBlock=document.createElement('div');
 freqBlock.innerHTML=`<h3>Učení a historie čísel</h3><p>Nejčastější čísla v historii:</p>${chips([...frequencies].sort((a,b)=>b.count-a.count||a.n-b.n).slice(0,10))}<p>Nejméně častá čísla v historii:</p>${chips([...frequencies].sort((a,b)=>a.count-b.count||a.n-b.n).slice(0,10))}<p>Datový základ: ${statsData.count} historických tahů a ${statsData.checked} sázek spárovaných s losováním. Četnosti slouží k analýze, nikoliv k zaručení výhry.</p><h3>Kontrola výherních pořadí Extra Renty</h3><div class="renta-fin-audit">${[['Ověřené sloupce',evaluated],['Výherní kombinace',winning],['Bez výsledku',bets.length-evaluated],['Neurčené pořadí (6 shod)',uncertain]].map(([k,v])=>`<div><span>${k}</span><strong>${v}</strong></div>`).join('')}</div><h3>Časová kontrola SMART HYBRID</h3><p>Test ${audit.trials} historických tahů bez znalosti budoucích výsledků. Průměr shod: dlouhodobá četnost ${audit.longAvg.toFixed(2)}, posledních 30 tahů ${audit.recentAvg.toFixed(2)}, náhodné očekávání ${audit.randomAvg.toFixed(2)}.</p>`;
 section.append(freqBlock);

 content.textContent=`SMART HYBRID: ${statsData.count} historických tahů, ${statsData.checked} ověřených sázek. Časový test ${audit.trials} tahů bez znalosti budoucích výsledků: dlouhodobá četnost ${audit.longAvg.toFixed(2)}, posledních 30 tahů ${audit.recentAvg.toFixed(2)}, náhodné očekávání ${audit.randomAvg.toFixed(2)} shody. Test četností není důkaz predikční výhody. Výherní pravidla: ${rules.source||'pravidla Extra Renty'}; základ 25 Kč nebo dvojnásobek při 50 Kč. U šesti zásahů je nutné znát dodatkové číslo. Historie renta.csv uchovává jen sedm hlavních čísel.`;
 section.append(content);root.append(section);

}

function openFinance(){renderFinance();financeDialog().showModal()}
function setup(){let section=document.createElement('details');section.className='section renta-settings';section.innerHTML='<summary style="cursor:pointer;color:#8bb7f0;font-weight:700">⚙ Nastavení · GitHub · import / export</summary>'+ `<div class="section-header"><span class="section-title">GitHub synchronizace a data</span></div><div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center"><input id="gh-owner" placeholder="GitHub uživatel" style="width:160px;box-sizing:border-box;background:#13213a!important;color:#fff!important;border:1px solid #425b7e!important;border-radius:6px!important;padding:10px!important;font:inherit!important"><input id="gh-repo" placeholder="Repozitář" style="width:160px;box-sizing:border-box;background:#13213a!important;color:#fff!important;border:1px solid #425b7e!important;border-radius:6px!important;padding:10px!important;font:inherit!important"><input id="gh-token" type="password" placeholder="GitHub token (při změně volitelné)" style="width:220px;box-sizing:border-box;background:#13213a!important;color:#fff!important;border:1px solid #425b7e!important;border-radius:6px!important;padding:10px!important;font:inherit!important"><label id="gh-remember-label" style="display:flex;align-items:center;justify-content:flex-start;gap:6px;width:100%;margin:0;font-size:12px;color:#a9c8ef;cursor:pointer"><input id="gh-remember" type="checkbox" style="width:auto!important;min-width:0!important;max-width:none!important;flex:0 0 auto!important;margin:0!important;padding:0!important;display:inline-block!important;appearance:auto!important">Pamatovat klíč na tomto zařízení</label><button class="blue" id="gh-connect">Nastavit přístup</button><span id="gh-saved-status" style="font-size:12px;color:#a9c8ef" role="status"></span><button class="blue" id="gh-pull">Načíst společnou</button><button class="green" id="gh-push">Uložit společnou</button><button class="red" id="gh-disconnect">Odpojit klíč</button></div><div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:12px;align-items:center"><label style="cursor:pointer" class="blue">Import renta.csv <input id="import-history" type="file" accept=".csv" style="max-width:180px"></label><label>Import sázek <input id="import-bets" type="file" accept=".csv" style="max-width:180px"></label><button class="blue" id="export-history">Export historie CSV</button><button class="blue" id="export-bets">Export sázek CSV</button><button class="blue" id="export-predictions">Export predikcí CSV</button><button class="blue" id="export-json">Záloha JSON</button><label>Obnovit JSON <input id="import-json" type="file" accept=".json" style="max-width:180px"></label></div><p style="font-size:12px;color:#8bb7f0">Token se trvale uloží pouze při zaškrtnutí „Pamatovat klíč na tomto zařízení“ (nepoužívej na sdíleném počítači). GitHub Pages není přihlašovací server. Změny se synchronizují automaticky; tlačítka Načíst/Uložit společnou slouží i k ruční kontrole.</p>`;
section.querySelector('#export-json').insertAdjacentHTML('afterend','<button type="button" id="renta-finance-open" class="blue">Bilance sázek</button>');section.insertAdjacentHTML('beforeend','<p id="renta-sync-warning" role="status" style="color:#ffbf69;font-size:13px"></p>');let target=document.querySelector('.content-sections');if(target)target.prepend(section);else document.body.append(section);document.getElementById('renta-finance-open').onclick=openFinance;document.getElementById('gh-owner').value=cfg.owner||'';document.getElementById('gh-repo').value=cfg.repo||'';document.getElementById('gh-remember').checked=localStorage.getItem(REMEMBER_KEY)==='1'||(localStorage.getItem(REMEMBER_KEY)===null&&!!localStorage.getItem(CFG));const savedStatus=document.getElementById('gh-saved-status');const refreshSavedStatus=()=>{savedStatus.textContent='';document.getElementById('gh-token').placeholder=config()?'Token uložen – pro změnu zadej nový':'GitHub token';};refreshSavedStatus();const notice=(m,type='success')=>{if(typeof displayStatusMessage==='function')displayStatusMessage(m,type);else alert(m)};
const action=(id,fn)=>document.getElementById(id).onclick=async()=>{try{await fn();if(!id.startsWith('gh-'))notice('Hotovo.','success')}catch(e){if(id.startsWith('gh-'))syncState('chyba synchronizace: '+e.message,'error');else notice(e.message,'error')}};
action('gh-connect',async()=>{const owner=document.getElementById('gh-owner').value.trim(),repo=document.getElementById('gh-repo').value.trim(),enteredToken=document.getElementById('gh-token').value.trim();const nextCfg={owner,repo,token:enteredToken||(owner===cfg.owner&&repo===cfg.repo?cfg.token:''),path:'renta-data.json'};if(!nextCfg.owner||!nextCfg.repo||!nextCfg.token)throw Error('Vyplň uživatele, repozitář a token (při opětovném připojení stačí uložený token).');cfg=nextCfg;const remember=document.getElementById('gh-remember').checked;localStorage.setItem(REMEMBER_KEY,remember?'1':'0');if(remember)localStorage.setItem(CFG,JSON.stringify(cfg));else localStorage.removeItem(CFG);sessionStorage.setItem(CFG,JSON.stringify(cfg));document.getElementById('gh-token').value='';refreshSavedStatus();sha=null;if(dirty){notice('Přístup uložen. Místní data nejsou synchronizována: použij Načíst společnou nebo Uložit společnou.','info');return;}let ok=await pull();if(ok){location.reload()}else notice('Přístup nastaven. Na GitHubu zatím nejsou společná data; můžeš je poprvé uložit.');});
action('gh-pull',async()=>{if(dirty){if(!confirm('Místní data nejsou synchronizována. Před načtením GitHubu se automaticky stáhne jejich záloha JSON. Pokračovat?'))return;download('renta-zaloha-pred-nactenim.json',JSON.stringify(data,null,2));if(!confirm('Záloha byla stažena. Opravdu nahradit místní sázky a predikce daty z GitHubu?'))return;}else if(!confirm('Načíst společnou verzi z GitHubu?'))return;let ok=await pull(true);if(!ok)throw Error('Soubor renta-data.json zatím na GitHubu neexistuje.');location.reload()});
action('gh-push',async()=>{let latest=await remote();if(latest){let other=JSON.parse(decode(latest.content));if(JSON.stringify(other.bets)!==JSON.stringify(data.bets)||JSON.stringify(other.predictions)!==JSON.stringify(data.predictions)){download('renta-zaloha-pred-ulozenim.json',JSON.stringify(data,null,2));if(!confirm('GitHub obsahuje jiné sázky nebo predikce. Místní záloha JSON byla stažena. Opravdu PŘEPSAT společná data místní verzí?'))return;}}sha=latest?.sha||null;syncState('odesílám změny…');await push();});
action('gh-disconnect',async()=>{cfg={};sha=null;sessionStorage.removeItem(CFG);localStorage.removeItem(CFG);localStorage.removeItem(REMEMBER_KEY);document.getElementById('gh-remember').checked=false;document.getElementById('gh-token').value='';document.getElementById('gh-owner').value='';document.getElementById('gh-repo').value='';refreshSavedStatus();syncSignal(false,'GitHub přístup odpojen');syncState('GitHub nepřipojen','error');notice('Přístupový klíč odebrán z tohoto prohlížeče.');});
for(let [id,parser,field] of [['import-history',parseHistory,'history'],['import-bets',parseBets,'bets']])document.getElementById(id).onchange=async e=>{try{let file=e.target.files[0];if(!file)return;let rows=parser(await file.text());if(!confirm(`Nahradit ${field==='history'?'historii losování':'historii sázek'} (${rows.length} záznamů)?`))return;data[field]=rows;persist();location.reload()}catch(err){notice(err.message,'error')}};
action('export-history',()=>download('renta.csv',formatHistory()));action('export-bets',()=>download('vsazene_kombinace.csv',formatBets()));action('export-predictions',()=>download('renta_predikce.csv',formatPredictions()));action('export-json',()=>download('renta-zaloha.json',JSON.stringify(data,null,2)));document.getElementById('import-json').onchange=async e=>{try{let d=JSON.parse(await e.target.files[0].text());if(!Array.isArray(d.history)||!Array.isArray(d.bets))throw Error('Neplatná záloha');if(confirm('Obnovit zálohu a přepsat místní data?')){data=d;persist();location.reload()}}catch(err){notice(err.message,'error')}};
}
// Stejný kontrolní interval jako Sportka; při místních změnách nikdy nepřepisovat data.
 let polling=false;
 async function periodicSync(){
  if(polling||syncing||!config()||!navigator.onLine||dirty)return;
  polling=true;
  try{
   let latest=await remote();
   if(!latest){syncState('společná data na GitHubu nebyla nalezena','error');return;}
   if(latest.sha!==sha){
    let d=JSON.parse(decode(latest.content));
    if(!Array.isArray(d.history)||!Array.isArray(d.bets)||!Array.isArray(d.predictions))throw Error('Neplatná struktura společných dat.');
    if(dirty)return;
    const oldHistory=data.history;
    const localFinance=data.finance;data=d;if(!data.finance&&localFinance)data.finance=localFinance;sha=latest.sha;localStorage.setItem(KEY,JSON.stringify(data));
    mergeHistory(oldHistory);evaluate(true);localStorage.setItem(KEY,JSON.stringify(data));scheduleLocalCsv();
    if(typeof loadPredictions==='function')loadPredictions();
    if(typeof loadStakedHistory==='function')loadStakedHistory();
   }
   syncSignal(true);
  }catch(e){syncSignal(false,e.message);syncState('chyba synchronizace: '+e.message,'error');console.warn('GitHub synchronizace:',e.message)}
  finally{polling=false}
 }
 setInterval(periodicSync,15000);
 window.addEventListener('online',periodicSync);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)periodicSync()});
 document.addEventListener('DOMContentLoaded',async()=>{setup();scheduleLocalCsv();try{let n=await refreshHistory();if(n){console.info('Doplněno '+n+' nových tahů z renta.csv');if(typeof loadStakedHistory==='function')loadStakedHistory();}}catch(e){console.warn(e.message)}if(config()){try{if(!dirty){let ok=await pull();if(ok){let n=await refreshHistory().catch(()=>0);if(n)scheduleSave();if(typeof loadPredictions==='function')loadPredictions();if(typeof loadStakedHistory==='function')loadStakedHistory();}}}catch(e){console.warn('GitHub:',e.message)}}});
})();
