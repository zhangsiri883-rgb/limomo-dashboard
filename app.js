'use strict';
const $=id=>document.getElementById(id);
const sharedMode=!['localhost','127.0.0.1','[::1]'].includes(location.hostname);
let sharedSnapshot='',sharedBusy=false;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const numeric=value=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
const date=value=>{if(!value)return '';const m=String(value).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);return m?`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`:'';};
const num=value=>value===null||value===undefined?'—':Number(value).toLocaleString('zh-CN',{maximumFractionDigits:0});
const money=value=>value===null||value===undefined?'—':`¥${Number(value).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const pct=value=>value===null||value===undefined?'—':`${(value*100).toFixed(2)}%`;
const safeUrl=value=>{try{const u=new URL(value);return /^https?:$/.test(u.protocol)?u.href:'';}catch{return '';}};
const ratio=(a,b)=>a!==null&&b!==null&&b!==0?a/b:null;
let coverScreenshots={};
let raw={},shop=[],links=[],notes=[],meta=[],tableState={},mediaBindings=new Map(),visibleCards=24,currentBind='',currentMaterial=[],lastSnapshot='';
let filters={compareStart:'',compareEnd:'',start:'',end:'',product:'',account:'',media:'',kind:''};
const columns={pay:['支付金额','money'],visitors:['商品访客数','num'],totalVisitors:['总访客数','num'],cart:['新增加购人数','num'],cartItems:['加购件数','num'],buyers:['支付买家数','num'],pv:['PV','pct'],cartRate:['加购率','pct'],payRate:['支付转化率','pct'],cartPayRate:['加购转化率','pct'],read:['笔记阅读量','num'],home:['引流主页次数','num'],noteCart:['笔记加购人数','num'],noteItems:['笔记加购件数','num'],like:['点赞数','num'],collect:['收藏数','num'],comment:['评论数','num'],follow:['新增关注次数','num'],shallow:['浅层互动率','pct'],deep:['深层互动率','pct'],homePay:['引流主页支付金额','money'],count:['发布总数','num'],commercial:['商品笔记数','num'],ordinary:['普通笔记数','num']};
const pick=(r,keys)=>{for(const k of keys)if(r[k]!==undefined&&r[k]!==null&&r[k]!=='')return r[k];return null;};
const performanceMetrics=[['销售指标','pay','支付金额','money'],['销售指标','totalVisitors','总访客数','num'],['销售指标','visitors','商品访客数','num'],['销售指标','pv','PV','pct'],['销售指标','cart','加购人数','num'],['销售指标','cartItems','加购件数','num'],['内容指标','pay','内容支付金额','money'],['内容指标','read','笔记阅读量','num'],['内容指标','home','引流主页次数','num'],['内容指标','noteItems','笔记加购件数','num'],['内容指标','like','点赞数','num'],['内容指标','collect','收藏数','num'],['内容指标','comment','评论数','num'],['内容指标','follow','新增关注次数','num'],['内容指标','shallow','浅层互动率','pct'],['内容指标','deep','深层互动率','pct']];
function monthBefore(value){if(!value)return '';const [year,month,day]=value.split('-').map(Number);const last=new Date(Date.UTC(year,month-1,0)).getUTCDate();return new Date(Date.UTC(year,month-2,Math.min(day,last))).toISOString().slice(0,10);}
function syncCompare(){if($('compareAuto').checked||!filters.compareStart){filters.compareStart=monthBefore(filters.start);filters.compareEnd=monthBefore(filters.end);}$('compareStart').value=filters.compareStart;$('compareEnd').value=filters.compareEnd;}
function initPerformance(){
 $('metricOptions').innerHTML=['销售指标','内容指标'].map(category=>`<fieldset><legend>${category}</legend>${performanceMetrics.map((m,i)=>m[0]===category?`<label><input type="checkbox" value="${i}" ${i<2?'checked':''}>${m[2]}</label>`:'').join('')}</fieldset>`).join('');
 $('metricOptions').addEventListener('change',performanceChart);
 for(const id of ['compareStart','compareEnd'])$(id).addEventListener('change',()=>{filters[id]=$(id).value;$('compareAuto').checked=false;render();});
 $('compareAuto').addEventListener('change',()=>{syncCompare();render();});
}
function performanceChart(){
 const selected=[...$('metricOptions').querySelectorAll('input:checked')].map(e=>performanceMetrics[Number(e.value)]);
 if(!selected.length){$('shopChart').innerHTML='<div class="empty">请在下拉菜单中勾选销售或内容指标</div>';return;}
 if(filters.compareStart>filters.compareEnd){$('shopChart').innerHTML='<div class="empty">对比开始日期不能晚于结束日期</div>';return;}
 const days=(a,b)=>{const result=[];for(let time=Date.parse(a+'T00:00:00Z'),end=Date.parse(b+'T00:00:00Z');time<=end&&result.length<1096;time+=86400000)result.push(new Date(time).toISOString().slice(0,10));return result;};
 const currentDays=days(filters.start,filters.end),compareDays=days(filters.compareStart,filters.compareEnd),length=Math.max(currentDays.length,compareDays.length);
 const colors=['#176bc4','#e66b39','#9690d0','#2b9d86','#d49a29','#cf608e','#5473a1'];
 const w=650,h=250,left=35,right=20,top=15,bottom=40,cw=w-left-right,ch=h-top-bottom;
 let svg='',legend='',any=false;
 for(let tick=0;tick<=4;tick++)svg+=`<line x1="${left}" y1="${top+ch*tick/4}" x2="${w-right}" y2="${top+ch*tick/4}" stroke="#e8eef6"/>`;
 selected.forEach((metric,index)=>{
  const [category,key,label,type]=metric,color=colors[index%colors.length];
  const source=category==='内容指标'?notes.filter(dimensions):shop.filter(r=>!filters.account&&!filters.media&&!filters.kind&&(!filters.product||r.product===filters.product));
  const daily=new Map(group(source,'date').map(r=>[r.name,r]));
  const current=currentDays.map(d=>daily.get(d)?.[key]??null),previous=compareDays.map(d=>daily.get(d)?.[key]??null),values=[...current,...previous].filter(v=>v!==null),maximum=Math.max(0,...values)||1;
  if(values.length)any=true;
  legend+=`<span style="color:${color}">● ${esc(label)} <small>标尺 0～${({num,money,pct}[type])(maximum)}${values.length?'':' · 无数据'}</small></span>`;
  for(const [arr,dates,dashed]of [[current,currentDays,false],[previous,compareDays,true]]){
   let path='',active=false;arr.forEach((value,i)=>{if(value===null){active=false;return;}const x=left+(length<2?cw/2:i*cw/(length-1)),y=top+ch-value/maximum*ch;path+=`${active?'L':'M'}${x},${y} `;active=true;svg+=`<circle cx="${x}" cy="${y}" r="3" fill="white" stroke="${color}" opacity="${dashed?.55:1}"><title>${dashed?'对比':'当期'} ${dates[i]} ${esc(label)}：${({num,money,pct}[type])(value)}</title></circle>`;});
   svg+=`<path d="${path}" fill="none" stroke="${color}" stroke-width="2.3" ${dashed?'stroke-dasharray="6 4" opacity=".55"':''}/>`;
  }
 });
 for(let i=0;i<length;i++)if(i%Math.ceil(length/7)===0||i===length-1)svg+=`<text x="${left+(length<2?cw/2:i*cw/(length-1))}" y="${h-20}" text-anchor="middle">${currentDays[i]?.slice(5)||'—'}</text><text x="${left+(length<2?cw/2:i*cw/(length-1))}" y="${h-5}" text-anchor="middle" opacity=".65">${compareDays[i]?.slice(5)||'—'}</text>`;
 $('shopChart').innerHTML=`<div class="legend performanceLegend">${legend}</div>${any?`<div class="chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="勾选指标的当期与对比期趋势">${svg}</svg></div>`:'<div class="empty">所选指标在当前筛选范围无数据</div>'}<p class="chartNote">当期 ${filters.start} ～ ${filters.end} · 对比 ${filters.compareStart} ～ ${filters.compareEnd}${!compareDays.some(d=>[...shop,...notes].some(r=>r.date===d))?' · 对比期暂无底表数据':''}</p>`;
}
function normalize(data){
 raw=data;shop=(data['店铺数据']||[]).filter(r=>date(r['日期'])&&numeric(r['总访客数'])!==null).map(r=>({date:date(r['日期']),product:String(pick(r,['统一商品名','商品名'])||''),pay:numeric(r['支付金额']),totalVisitors:numeric(r['总访客数']),visitors:numeric(r['商品访客数']),cart:numeric(r['新增加购人数']),cartItems:numeric(r['新增加购件数'])}));
 links=(data['链接数据']||[]).filter(r=>date(r['日期'])&&r['统一商品名']).map(r=>({date:date(r['日期']),product:String(r['统一商品名']).trim(),pay:numeric(r['支付金额']),visitors:numeric(r['商品访客数']),cart:numeric(r['新增加购人数']),buyers:numeric(r['支付买家数'])}));
 notes=[];
 for(const [sheet,kind]of [['商笔数据','商品笔记'],['普笔数据','普通笔记']])for(const [i,r]of (data[sheet]||[]).entries()){
   if(!date(r['日期'])||!r['笔记标题'])continue;
   const id=String(r['笔记ID']||r['笔记链接']||`${r['作者昵称']}|${r['笔记标题']}`);
   notes.push({id,date:date(r['日期']),product:String(r['统一商品名']||'未匹配商品').trim(),title:r['笔记标题'],url:safeUrl(r['笔记链接']),account:String(r['作者昵称']||'未知账号'),media:String(r['素材类型']||r['笔记类型']||'未提供'),kind,publish:date(pick(r,['笔记发布时间','发布时间','笔记创建时间'])),publishSource:pick(r,['笔记发布时间','发布时间'])?'发布时间':'创建时间',pay:numeric(r['引流店铺主页支付金额']),read:numeric(r['笔记阅读数']),home:numeric(r['引流店铺主页次数']),noteCart:numeric(pick(r,['笔记加购人数','加购人数'])),noteItems:numeric(r['笔记加购件数']),like:numeric(r['点赞次数']),collect:numeric(r['收藏次数']),comment:numeric(r['评论次数']),follow:numeric(r['笔记点击关注次数']),homePay:numeric(r['引流店铺主页支付金额']),cover:safeUrl(pick(r,['封面地址','封面链接','笔记封面','封面图'])),video:safeUrl(pick(r,['视频地址','视频链接','素材地址'])),duration:numeric(r['视频时长（秒）'])});
 }
 const byId=new Map();for(const n of notes)if(!byId.has(n.id))byId.set(n.id,n);meta=[...byId.values()];
 const allDates=[...shop,...links,...notes].map(r=>r.date).filter(Boolean).sort();
 lastSnapshot=data.updatedAt||'';
 $('rangeInfo').textContent=`底表日期 ${allDates[0]||'—'} ～ ${allDates.at(-1)||'—'} · 4 张数据页`;
 $('rowcount').textContent=`${shop.length+links.length+notes.length} 条有效记录 · ${meta.length} 篇笔记`;
 $('sync').textContent=`快照：${lastSnapshot?new Date(lastSnapshot).toLocaleString('zh-CN',{hour12:false}):'未知'}`;
 for(const [id,key,list]of [['product','product',[...links,...notes]],['account','account',notes],['media','media',notes]]){
   const value=$(id).value;$(id).innerHTML=`<option value="">全部${id==='product'?'商品':id==='account'?'账号':'素材'}</option>`+[...new Set(list.map(r=>r[key]).filter(Boolean))].sort().map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
   if([...$(id).options].some(o=>o.value===value))$(id).value=value;else filters[id]='';
 }
 if(!filters.end){filters.end=allDates.at(-1)||'';const d=new Date(filters.end+'T00:00:00');d.setDate(d.getDate()-6);filters.start=d.toLocaleDateString('en-CA');if(!/^\d{4}-/.test(filters.start))filters.start=d.toISOString().slice(0,10);}
 $('start').value=filters.start;$('end').value=filters.end;syncCompare();
 render();
}
const inDate=(d)=>!!d&&d>=filters.start&&d<=filters.end;
const dimensions=r=>(!filters.product||r.product===filters.product)&&(!filters.account||r.account===filters.account)&&(!filters.media||r.media===filters.media)&&(!filters.kind||r.kind===filters.kind);
const metricKeys=['pay','visitors','totalVisitors','cart','cartItems','buyers','read','home','noteItems','like','collect','comment','follow','homePay'];
function aggregate(rows){
 const result={_missing:{},_total:rows.length};
 for(const key of metricKeys){const values=rows.map(r=>r[key]).filter(v=>v!==null&&v!==undefined);result[key]=values.length?values.reduce((a,b)=>a+b,0):null;result._missing[key]=rows.length-values.length;}
 result.pv=ratio(result.visitors,result.totalVisitors);result.cartRate=ratio(result.cart,result.visitors);result.payRate=ratio(result.buyers,result.visitors);result.cartPayRate=ratio(result.buyers,result.cart);result.shallow=result.like!==null&&result.collect!==null?ratio(result.like+result.collect,result.read):null;result.deep=result.comment!==null&&result.follow!==null?ratio(result.comment+result.follow,result.read):null;
 return result;
}
function group(rows,key){const map=new Map();for(const r of rows){const k=r[key]||'未提供';if(!map.has(k))map.set(k,[]);map.get(k).push(r);}return [...map].map(([name,list])=>({name,...aggregate(list),_rows:list}));}
function kpis(id,values,emptyLabel='未提供'){
 $(id).innerHTML=values.map(([label,value,type='num',note=''])=>`<div class="kpi"><div class="label">${esc(label)}</div><div class="value ${value===null?'unavailable':''}">${value===null?esc(emptyLabel):({num,money,pct}[type])(value)}</div>${note?`<small>${esc(note)}</small>`:''}</div>`).join('');
}
function comparisonBadge(current,previous,type,invalid=false){
 if(invalid)return '<div class="comparison neutral">对比日期无效</div>';
 if(current===null||current===undefined)return '<div class="comparison neutral">当前无可比数据</div>';
 if(previous===null||previous===undefined)return '<div class="comparison neutral">对比期无数据</div>';
 const difference=current-previous;
 if(type!=='pct'&&previous===0&&current!==0)return '<div class="comparison neutral">对比期为 0，无法计算环比</div>';
 const change=type==='pct'?difference*100:previous===0?0:difference/previous*100;
 const rounded=Number(change.toFixed(2)),direction=rounded>0?'up':rounded<0?'down':'flat';
 const text=rounded===0?'环比持平':`环比 ${rounded>0?'▲ +':'▼ '}${rounded.toFixed(2)}${type==='pct'?'pp':'%'}`;
 return `<div class="comparison ${direction}">${text}</div>`;
}
function addComparisons(id,keys,current,previous){
 const invalid=!filters.compareStart||!filters.compareEnd||filters.compareStart>filters.compareEnd;
 [...$(id).children].forEach((card,i)=>{const key=keys[i],type=columns[key]?.[1]||'num';card.insertAdjacentHTML('beforeend',comparisonBadge(current[key],previous[key],type,invalid));card.title=`对比 ${filters.compareStart} ～ ${filters.compareEnd}：${previous[key]===null?'无数据':({num,money,pct}[type])(previous[key])}${current._missing?.[key]||previous._missing?.[key]?'；部分记录未提供该字段':''}`;});
}
function table(id,rows,keys,first='商品名',total=null,previousRows=[],previousTotal=null){
 const previous=new Map(previousRows.map(r=>[r.name,r]));rows=rows.map(r=>({...r,_previous:previous.get(r.name)||{}}));if(total)total={...total,_previous:previousTotal||{}};
 const old=tableState[id]||{};tableState[id]={rows,keys,first,total,sort:old.sort||'',direction:old.direction||-1};drawTable(id);
}
function cell(r,key,max){const value=r[key],type=columns[key]?.[1]||'num';let text=value===null||value===undefined?`<span class="na">${type==='pct'?'—':'未提供'}</span>`:({num,money,pct}[type])(value);if(key==='pay'&&value!==null&&max>0)text=`<i class="dataBar" style="width:${Math.max(0,value)/max*55}px"></i>`+text;if(r._missing?.[key]>0&&value!==null)text+='<span class="partial">部分记录未提供</span>';const prior=r._previous?.[key];const badge=comparisonBadge(value,prior,type,!filters.compareStart||!filters.compareEnd||filters.compareStart>filters.compareEnd);const previousText=prior===null||prior===undefined?'无数据':({num,money,pct}[type])(prior);return `<td title="${esc('对比期：'+previousText)}">${text}${badge}</td>`;}
function drawTable(id){
 const s=tableState[id];let rows=[...s.rows];if(s.sort)rows.sort((a,b)=>s.sort==='name'?s.direction*String(a.name).localeCompare(String(b.name),'zh-CN'):(a[s.sort]===null?1:b[s.sort]===null?-1:s.direction*((a[s.sort]||0)-(b[s.sort]||0))));
 const max=Math.max(0,...rows.map(r=>r.pay||0));
 $(id).innerHTML=`<div class="tablewrap"><table><thead><tr>${['name',...s.keys].map(key=>`<th data-table="${id}" data-key="${key}" tabindex="0">${esc(key==='name'?s.first:columns[key][0])}${s.sort===key?(s.direction===1?' ↑':' ↓'):''}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td title="${esc(r.name)}">${esc(r.name)}</td>${s.keys.map(key=>cell(r,key,max)).join('')}</tr>`).join(''):`<tr><td colspan="${s.keys.length+1}" class="na">当前筛选范围无数据</td></tr>`}</tbody>${s.total&&rows.length?`<tfoot><tr><td>合计</td>${s.keys.map(key=>cell(s.total,key,max)).join('')}</tr></tfoot>`:''}</table></div>`;
}
function lineChart(id,rows,series){
 const grouped=group(rows,'date').sort((a,b)=>a.name.localeCompare(b.name));
 if(!grouped.length||!series.some(s=>grouped.some(r=>r[s.key]!==null))){$(id).innerHTML='<div class="empty">当前筛选范围无可用数据</div>';return;}
 const w=650,h=235,left=45,right=45,top=20,bottom=32,cw=w-left-right,ch=h-top-bottom;
 const scales=series.map(s=>Math.max(0,...grouped.map(r=>r[s.key]||0))||1);
 let svg='';for(let i=0;i<=4;i++){const y=top+ch*i/4;svg+=`<line x1="${left}" y1="${y}" x2="${w-right}" y2="${y}" stroke="#e8eef6"/><text x="${left-8}" y="${y+3}" text-anchor="end">${series[0].type==='pct'?pct(scales[0]*(1-i/4)):num(scales[0]*(1-i/4))}</text>`;}
 const x=i=>left+(grouped.length===1?cw/2:i*cw/(grouped.length-1));
 for(const [j,s]of series.entries()){
   const points=grouped.map((r,i)=>r[s.key]===null?null:[x(i),top+ch-(r[s.key]/scales[j])*ch]);
   let path='';let active=false;for(const p of points){if(!p){active=false;continue;}path+=`${active?'L':'M'}${p[0]},${p[1]} `;active=true;}
   svg+=`<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2.5"/>`;
   points.forEach((p,i)=>{if(p)svg+=`<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="white" stroke="${s.color}" stroke-width="2"><title>${esc(grouped[i].name)} ${esc(s.label)}：${s.type==='pct'?pct(grouped[i][s.key]):num(grouped[i][s.key])}</title></circle>`;});
   if(j===1)for(let i=0;i<=4;i++)svg+=`<text x="${w-right+8}" y="${top+ch*i/4+3}">${s.type==='pct'?pct(scales[j]*(1-i/4)):num(scales[j]*(1-i/4))}</text>`;
 }
 grouped.forEach((r,i)=>{if(grouped.length<12||i%Math.ceil(grouped.length/8)===0||i===grouped.length-1)svg+=`<text x="${x(i)}" y="${h-8}" text-anchor="middle">${r.name.slice(5)}</text>`;});
 $(id).innerHTML=`<div class="legend">${series.map((s,i)=>`<span><i style="background:${s.color}"></i>${esc(s.label)}${series.length>1?`（${i?'右':'左'}轴）`:''}</span>`).join('')}</div><div class="chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="每日指标趋势">${svg}</svg></div>`;
}

function publicationTrend(published){
 const daily=new Map();
 const end=new Date(filters.end+'T00:00:00Z');
 for(let day=new Date(filters.start+'T00:00:00Z');day<=end;day.setUTCDate(day.getUTCDate()+1))daily.set(day.toISOString().slice(0,10),{count:0,commercial:0,ordinary:0});
 for(const note of published){const row=daily.get(note.publish);if(row){row.count++;row[note.kind==='商品笔记'?'commercial':'ordinary']++;}}
 const rows=[...daily.entries()],w=650,h=280,left=42,right=20,top=22,bottom=38,cw=w-left-right,ch=h-top-bottom;
 if(!rows.length){$('publishTrend').innerHTML='<div class="empty">请选择有效日期范围</div>';return;}
 const maximum=Math.max(1,...rows.map(([,r])=>r.count)),step=Math.max(1,Math.ceil(maximum/4)),ceiling=step*4;
 const x=i=>left+(rows.length===1?cw/2:i*cw/(rows.length-1));
 let svg='';for(let i=0;i<=4;i++){const y=top+ch*i/4;svg+=`<line x1="${left}" y1="${y}" x2="${w-right}" y2="${y}" stroke="#e8eef6"/><text x="${left-9}" y="${y+4}" text-anchor="end">${ceiling-step*i}</text>`;}
 const series=[['count','发布总数','#176bc4'],['commercial','商品笔记','#e66b39'],['ordinary','普通笔记','#9690d0']];
 for(const [key,label,color]of series){const points=rows.map(([,r],i)=>[x(i),top+ch-r[key]/ceiling*ch]);svg+=`<polyline points="${points.map(p=>p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="2.5"/>`;points.forEach(([px,py],i)=>{svg+=`<circle cx="${px}" cy="${py}" r="4" fill="white" stroke="${color}" stroke-width="2"><title>${rows[i][0]} ${label}：${rows[i][1][key]} 篇</title></circle>`;});}
 rows.forEach(([day],i)=>{if(rows.length<9||i%Math.ceil(rows.length/7)===0||i===rows.length-1)svg+=`<text x="${x(i)}" y="${h-10}" text-anchor="middle">${day.slice(5)}</text>`;});
 $('publishTrend').innerHTML=`<div class="legend">${series.map(([,label,color])=>`<span><i style="background:${color}"></i>${label}</span>`).join('')}</div><div class="chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="每日笔记发布数量趋势">${svg}</svg></div>`;
}

function visitorFunnel(totals){
 const stages=[['全店访客',totals.totalVisitors],['商品访客',totals.visitors],['加购人数',totals.cart]];
 if(stages.some(([,value])=>value===null)){$('productChart').innerHTML='<div class="empty">当前筛选维度无店铺访客数据</div>';return;}
 const maximum=Math.max(1,...stages.map(([,value])=>value));
 const colors=['#176bc4','#4d96dc','#8dbbea'];
 const w=600,center=230,available=380,top=18,height=65,gap=35;
 let svg='';
 stages.forEach(([label,value],i)=>{
  const y=top+i*(height+gap),width=available*value/maximum;
  const next=i<stages.length-1?available*stages[i+1][1]/maximum:width*.7;
  const a=Math.max(4,width),b=Math.max(3,next);
  svg+=`<polygon points="${center-a/2},${y} ${center+a/2},${y} ${center+b/2},${y+height} ${center-b/2},${y+height}" fill="${colors[i]}"><title>${label}：${num(value)}人</title></polygon>`;
  svg+=`<text x="450" y="${y+25}" fill="#42617e" font-size="14">${label}</text><text x="450" y="${y+49}" fill="#163f6c" font-size="20" font-weight="bold">${num(value)} 人</text>`;
  if(i<stages.length-1)svg+=`<text x="${center}" y="${y+height+23}" text-anchor="middle" fill="#7d91a8" font-size="12">↓ 转化率 ${pct(ratio(stages[i+1][1],value))}</text>`;
 });
 $('productChart').innerHTML=`<div class="visitorFunnel"><svg viewBox="0 0 600 295" role="img" aria-label="全店访客到商品访客到加购人数漏斗">${svg}</svg></div><p class="chartNote">整体加购率 ${pct(ratio(totals.cart,totals.totalVisitors))} · 人数为所选周期每日人数之和；阶段人数不代表同一批用户追踪。</p>`;
}
function rankChart(id,rows,key='pay',second=''){
 rows=[...rows].sort((a,b)=>(b[key]||0)-(a[key]||0)).slice(0,8);const max=Math.max(0,...rows.map(r=>r[key]||0),...rows.map(r=>r[second]||0))||1;
 $(id).innerHTML=rows.length?`<div class="legend"><span><i style="background:#3f89d3"></i>${columns[key][0]}</span>${second?`<span><i style="background:#aaa0d7"></i>${columns[second][0]}</span>`:''}</div>`+rows.map(r=>`<div class="rankrow" data-product="${esc(r.name)}"><span title="${esc(r.name)}">${esc(r.name)}</span><div><div class="track"><div class="bar" style="width:${(r[key]||0)/max*100}%"></div></div>${second?`<div class="track" style="margin-top:5px"><div class="bar" style="background:#aaa0d7;width:${(r[second]||0)/max*100}%"></div></div>`:''}</div><b>${key==='pay'?money(r[key]):num(r[key])}${second?`<br><small>${num(r[second])}</small>`:''}</b></div>`).join(''):'<div class="empty">当前筛选范围无数据</div>';
}
function productRanking(rows){
 const key=$('rankingMetric').value,type=columns[key][1],format={num,money,pct}[type];
 const ranked=[...rows].filter(r=>r[key]!==null&&r[key]!==undefined).sort((a,b)=>b[key]-a[key]||a.name.localeCompare(b.name,'zh-CN')).slice(0,10);
 const maximum=Math.max(0,...ranked.map(r=>r[key]))||1;
 $('rankingChart').innerHTML=ranked.length?`<div class="legend"><span><i style="background:#3f89d3"></i>${esc(columns[key][0])} · TOP 10</span></div>`+ranked.map((r,i)=>`<div class="rankrow" data-product="${esc(r.name)}" title="${esc(r.name)}：${esc(format(r[key]))}"><span>${i+1}. ${esc(r.name)}</span><div class="track"><div class="bar" style="width:${Math.max(0,r[key])/maximum*100}%"></div></div><b>${format(r[key])}</b></div>`).join(''):'<div class="empty">当前筛选范围无可用排行数据</div>';
}
function mediaChart(rows){
 const g=group(rows,'media'),total=aggregate(rows).read;if(!g.length||!total){$('mediaChart').innerHTML='<div class="empty">当前筛选范围无可用数据</div>';return;}
 const w=600,h=235,left=45,right=45,top=20,bottom=35,ch=h-top-bottom,cw=w-left-right;let svg='';
 const maxRate=Math.max(.01,...g.flatMap(r=>[r.shallow||0,r.deep||0]));
 for(let i=0;i<=4;i++){const y=top+ch*i/4;svg+=`<line x1="${left}" y1="${y}" x2="${w-right}" y2="${y}" stroke="#e8eef6"/><text x="${left-8}" y="${y+3}" text-anchor="end">${100-i*25}%</text><text x="${w-right+7}" y="${y+3}">${pct(maxRate*(1-i/4))}</text>`;}
 const x=i=>left+cw*(i+.5)/g.length;
 g.forEach((r,i)=>{const height=(r.read||0)/total*ch;svg+=`<rect x="${x(i)-Math.min(35,cw/g.length*.24)}" y="${top+ch-height}" width="${Math.min(70,cw/g.length*.48)}" height="${height}" rx="4" fill="#9690d0"><title>${esc(r.name)} 阅读占比 ${pct(r.read/total)}</title></rect><text x="${x(i)}" y="${h-10}" text-anchor="middle">${esc(r.name)}</text>`;});
 for(const [key,color]of [['shallow','#e66b39'],['deep','#176bc4']]){svg+=`<polyline points="${g.map((r,i)=>`${x(i)},${top+ch-(r[key]||0)/maxRate*ch}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2.5"/>`;g.forEach((r,i)=>{svg+=`<circle cx="${x(i)}" cy="${top+ch-(r[key]||0)/maxRate*ch}" r="4" fill="white" stroke="${color}" stroke-width="2"><title>${esc(r.name)} ${columns[key][0]} ${pct(r[key])}</title></circle>`;});}
 $('mediaChart').innerHTML='<div class="legend"><span><i style="background:#9690d0"></i>阅读占比（左轴）</span><span><i style="background:#e66b39"></i>浅层互动率（右轴）</span><span><i style="background:#176bc4"></i>深层互动率（右轴）</span></div>'+`<div class="chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="素材类型阅读占比与互动率">${svg}</svg></div>`;
}
function render(){
 if(filters.start>filters.end){$('alert').textContent='开始日期不能晚于结束日期。';return;}
 const detailFilter=!!(filters.account||filters.media||filters.kind);
 const l=detailFilter?[]:links.filter(r=>inDate(r.date)&&(!filters.product||r.product===filters.product));
 const n=notes.filter(r=>inDate(r.date)&&dimensions(r));
 const s=shop.filter(r=>inDate(r.date)&&(!filters.product||r.product===filters.product)&&!detailFilter);
 const shopUnavailable=detailFilter||!!filters.product&&!shop.some(r=>r.product);
 const totals=aggregate(s),linkTotals=aggregate(l),contentTotals=aggregate(n);
 const inCompare=r=>r.date>=filters.compareStart&&r.date<=filters.compareEnd;
 const previousShop=aggregate(shop.filter(r=>inCompare(r)&&(!filters.product||r.product===filters.product)&&!detailFilter));
 const previousContent=aggregate(notes.filter(r=>inCompare(r)&&dimensions(r)));
 $('period').textContent=`当期 ${filters.start} ～ ${filters.end} · 对比 ${filters.compareStart} ～ ${filters.compareEnd}`;
 const alerts=[];if(shopUnavailable)alerts.push('店铺底表不具备当前商品／内容维度，经营总览不展示未筛选的全店数据。');if(detailFilter)alerts.push('链接底表没有账号、素材及笔记类型维度，当前链接分析显示无维度数据。');
 $('alert').textContent=alerts.join(' ');
 kpis('shopKpis',[['支付金额',totals.pay,'money'],['总访客数',totals.totalVisitors],['商品访客数',totals.visitors],['PV',totals.pv,'pct'],['加购人数',totals.cart],['加购件数',totals.cartItems]],shopUnavailable?'该维度无数据':'无数据');
 $('shopNote').textContent='PV＝商品访客数 ÷ 总访客数。跨日人数为每日人数之和，非周期去重人数。';
 addComparisons('shopKpis',['pay','totalVisitors','visitors','pv','cart','cartItems'],totals,previousShop);
 performanceChart();
 const lg=group(l,'product');visitorFunnel(totals);productRanking(lg);rankChart('linkChart',lg,'cart','buyers');
 table('linkTable',lg,['pay','visitors','cart','buyers','cartRate','payRate','cartPayRate'],'商品名',linkTotals,group(detailFilter?[]:links.filter(r=>inCompare(r)&&(!filters.product||r.product===filters.product)),'product'),aggregate(detailFilter?[]:links.filter(r=>inCompare(r)&&(!filters.product||r.product===filters.product))));
 lineChart('rateChart',l,[{key:'cartRate',label:'加购率',color:'#9690d0',type:'pct'},{key:'payRate',label:'支付转化率',color:'#176bc4',type:'pct'}]);
 kpis('contentKpis',[['内容支付金额',contentTotals.pay,'money'],['笔记阅读量',contentTotals.read],['引流主页次数',contentTotals.home],['笔记加购件数',contentTotals.noteItems],['点赞数',contentTotals.like],['收藏数',contentTotals.collect],['评论数',contentTotals.comment],['新增关注次数',contentTotals.follow],['浅层互动率',contentTotals.shallow,'pct'],['深层互动率',contentTotals.deep,'pct']]);
 lineChart('contentChart',n,[{key:'read',label:'阅读量',color:'#176bc4'},{key:'home',label:'引流主页次数',color:'#e66b39'}]);mediaChart(n);
 addComparisons('contentKpis',['pay','read','home','noteItems','like','collect','comment','follow','shallow','deep'],contentTotals,previousContent);
 const published=meta.filter(r=>inDate(r.publish)&&dimensions(r));
 const publicationProducts=[...new Set([...meta.filter(dimensions).map(r=>r.product),...(!filters.account&&!filters.media&&!filters.kind?links.filter(r=>!filters.product||r.product===filters.product).map(r=>r.product):[])])].sort((a,b)=>a.localeCompare(b,'zh-CN'));
 const countRows=rows=>{const groups=new Map(group(rows,'product').map(g=>[g.name,g._rows]));return publicationProducts.map(name=>{const list=groups.get(name)||[];return {name,count:list.length,commercial:list.filter(r=>r.kind==='商品笔记').length,ordinary:list.filter(r=>r.kind==='普通笔记').length};});};
 const pg=countRows(published);
 if(!tableState.publishTable)tableState.publishTable={sort:'count',direction:-1};
 const pc={count:published.length,commercial:published.filter(r=>r.kind==='商品笔记').length,ordinary:published.filter(r=>r.kind==='普通笔记').length};
 const previousPublished=meta.filter(r=>r.publish>=filters.compareStart&&r.publish<=filters.compareEnd&&dimensions(r));
 const countTotal=rows=>({count:rows.length,commercial:rows.filter(r=>r.kind==='商品笔记').length,ordinary:rows.filter(r=>r.kind==='普通笔记').length});
 const hasPriorPublication=meta.some(r=>r.publish>=filters.compareStart&&r.publish<=filters.compareEnd);
 table('publishTable',pg,['count','commercial','ordinary'],'商品名',pc,hasPriorPublication?countRows(previousPublished):[],hasPriorPublication?countTotal(previousPublished):null);
 publicationTrend(published);
 const effectKeys=['pay','read','home','noteItems','like','collect','comment','follow','shallow','deep'];
 for(const [id,key,label]of [['effectProduct','product','商品名'],['effectAccount','account','账号'],['effectMedia','media','素材类型'],['effectKind','kind','笔记类型']])table(id,group(n,key),effectKeys,label,contentTotals,group(notes.filter(r=>inCompare(r)&&dimensions(r)),key),previousContent);
 currentMaterial=group(n,'id').map(g=>({...g._rows[0],...g}));
 if($('newOnly').checked)currentMaterial=currentMaterial.filter(r=>inDate(r.publish));
 const query=$('search').value.trim().toLowerCase();if(query)currentMaterial=currentMaterial.filter(r=>[r.title,r.product,r.account].join(' ').toLowerCase().includes(query));
 const key=$('sort').value;currentMaterial.sort((a,b)=>key==='publish'?b.publish.localeCompare(a.publish):(b[key]??-1)-(a[key]??-1));
 drawCards();
}
function getMedia(r){return mediaBindings.get(r.id)|| (coverScreenshots[r.id]?[{type:'image',url:coverScreenshots[r.id]}]:r.video?[{type:'video',url:r.video}]:r.cover?[{type:'image',url:r.cover}]:[]);}
function drawCards(){
 $('materialInfo').textContent=`符合筛选 ${currentMaterial.length} 篇 · 每篇合并当期效果 · 素材来源：底表笔记链接；可打开笔记预览，也可绑定本地素材`;
 $('cards').innerHTML=currentMaterial.slice(0,visibleCards).map((r,i)=>{
 const media=getMedia(r)[0];const cover=media?(media.type==='video'?`<video controls preload="metadata" src="${esc(media.url)}"></video>`:`<img src="${esc(media.url)}" alt="${esc(r.title)}" loading="lazy">`):`<div class="placeholder"><strong>▷</strong>${r.url?'笔记链接素材':'无笔记链接'}<small>${r.url?'点击预览笔记素材':'可绑定本地图片或视频'}</small>${r.url?`<button data-preview="${esc(r.id)}">预览素材</button>`:''}</div>`;
 return `<article class="material"><div class="cover">${cover}<div class="badges"><span class="badge">#${i+1}　${esc(r.media)}</span><span class="badge">${esc(r.kind)}</span></div><button class="bind" data-bind="${esc(r.id)}">＋ 绑定素材</button></div><div class="cardbody"><h3 title="${esc(r.title)}">${esc(r.title)}</h3><div class="meta">${esc(r.product)} · ${esc(r.account)}<br>发布：${esc(r.publish||'未提供')}${r.publishSource==='创建时间'?'（创建时间）':''}</div><div class="metrics">${[['read','阅读量'],['like','点赞'],['collect','收藏'],['comment','评论'],['follow','新增关注'],['home','引流主页']].map(([key,label])=>`<div class="metric"><span>${label}</span><b>${r[key]===null?'—':num(r[key])}</b></div>`).join('')}</div><div class="rates"><div>浅层互动率<b>${pct(r.shallow)}</b></div><div>深层互动率<b>${pct(r.deep)}</b></div></div><div class="meta">支付金额 ${money(r.pay)}<br>加购件数 ${num(r.noteItems)}${r._missing?.pay>0&&r.pay!==null?' · 部分记录无成交字段':''}</div><div class="cardfoot"><button data-preview="${esc(r.id)}">⤢ 放大预览${getMedia(r).length>1?` (${getMedia(r).length})`:''}</button>${r.url?`<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">查看原笔记 ↗</a>`:'<span class="na">无笔记链接</span>'}</div></div></article>`;
 }).join('')||'<div class="empty">当前筛选范围没有笔记</div>';
 $('more').hidden=currentMaterial.length<=visibleCards;
}
function toast(message){$('toast').textContent=message;$('toast').style.display='block';setTimeout(()=>$('toast').style.display='none',5000);}
async function load(silent=false){if(sharedBusy)return;sharedBusy=true;try{const response=await fetch('data.json?t='+Date.now(),{cache:'no-store'});if(!response.ok)throw Error('底表读取失败');const snapshot=await response.text();const data=JSON.parse(snapshot);for(const sheet of ['店铺数据','链接数据','商笔数据','普笔数据'])if(!Array.isArray(data[sheet]))throw Error('数据格式不完整');if(snapshot!==sharedSnapshot){try{const covers=await fetch('covers.json?t='+Date.now(),{cache:'no-store'});if(covers.ok)coverScreenshots=await covers.json();}catch{}normalize(data);sharedSnapshot=snapshot;if(silent)toast('已同步最新发布的数据，保留当前筛选。');}return true;}catch(error){if(!silent)$('alert').textContent=error.message+'，保留上次数据，请稍后刷新。';return false;}finally{sharedBusy=false;}}
for(const id of ['start','end','product','account','media','kind'])$(id).addEventListener('change',()=>{filters[id]=$(id).value;if(id==='start'||id==='end')syncCompare();visibleCards=24;render();});
$('reset').addEventListener('click',()=>{filters={compareStart:'',compareEnd:'',start:'',end:'',product:'',account:'',media:'',kind:''};for(const id of ['product','account','media','kind'])$(id).value='';$('search').value='';$('newOnly').checked=false;$('compareAuto').checked=true;visibleCards=24;normalize(raw);});
for(const id of ['search','sort','newOnly'])$(id).addEventListener(id==='search'?'input':'change',()=>{visibleCards=24;render();});
$('more').addEventListener('click',()=>{visibleCards+=24;drawCards();});
$('refresh').addEventListener('click',async()=>{const button=$('refresh');button.disabled=true;button.textContent='正在读取…';try{if(sharedMode){if(await load())toast('已读取最新发布数据；页面每 30 秒自动检查更新。');return;}const response=await fetch('/api/refresh',{method:'POST'}),data=await response.json();if(!response.ok)throw Error(data.error);normalize(data);toast('已重新读取下载目录中的 Excel。在线变更需先从腾讯文档重新导出。');}catch(error){toast('刷新失败，保留上次数据：'+error.message);}finally{button.disabled=false;button.textContent='↻ 刷新数据';}});
$('importBtn').addEventListener('click',()=>{if(sharedMode){window.open('https://github.com/zhangsiri883-rgb/limomo-dashboard/upload/main','_blank','noopener');return;}$('file').click();});
$('file').addEventListener('change',async()=>{const file=$('file').files[0];if(!file)return;try{const response=await fetch('/api/import',{method:'POST',body:file}),data=await response.json();if(!response.ok)throw Error(data.error);normalize(data);toast('已导入 '+file.name);}catch(error){toast('导入失败，保留上次数据：'+error.message);}$('file').value='';});
document.addEventListener('click',event=>{
 const th=event.target.closest('th[data-table]');if(th){const s=tableState[th.dataset.table];s.direction=s.sort===th.dataset.key?-s.direction:-1;s.sort=th.dataset.key;drawTable(th.dataset.table);}
 const rank=event.target.closest('[data-product]');if(rank){filters.product=rank.dataset.product;$('product').value=filters.product;render();}
 const bind=event.target.closest('[data-bind]');if(bind){currentBind=bind.dataset.bind;$('mediaFile').click();}
 const preview=event.target.closest('[data-preview]');if(preview){const r=currentMaterial.find(r=>r.id===preview.dataset.preview),media=getMedia(r);$('previewBody').innerHTML=`<h3>${esc(r.title)}</h3>`+(media.length?media.map(m=>m.type==='video'?`<video controls src="${esc(m.url)}"></video>`:`<img src="${esc(m.url)}" alt="${esc(r.title)}">`).join(''):(r.url?`<p class="sub">来源：笔记链接。若平台限制嵌入或要求登录，请点击原笔记打开。</p><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">打开原笔记 ↗</a><iframe class="noteFrame" src="${esc(r.url)}" title="笔记素材预览" referrerpolicy="no-referrer"></iframe>`:'<div class="empty">未提供笔记链接，可绑定本地素材。</div>'));$('preview').showModal();}
 const exporter=event.target.closest('[data-export]');if(exporter){const s=tableState[exporter.dataset.export];const quote=value=>'"'+String(value??'').replace(/"/g,'""')+'"';const csv='\ufeff'+[[s.first,...s.keys.map(k=>columns[k][0])],...s.rows.map(r=>[r.name,...s.keys.map(k=>r[k]??'未提供')])].map(row=>row.map(quote).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=`${s.first}汇总_${filters.start}_${filters.end}.csv`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
});
document.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.matches('th[data-table]'))event.target.click();});
$('mediaFile').addEventListener('change',()=>{const files=[...$('mediaFile').files];if(!files.length)return;const old=mediaBindings.get(currentBind)||[];old.forEach(m=>URL.revokeObjectURL(m.url));mediaBindings.set(currentBind,files.map(file=>({type:file.type.startsWith('video/')?'video':'image',url:URL.createObjectURL(file)})));$('mediaFile').value='';drawCards();toast('素材已绑定，可在当前会话内预览。');});
$('closePreview').addEventListener('click',()=>{$('preview').close();$('previewBody').innerHTML='';});
$('preview').addEventListener('close',()=>{$('previewBody').innerHTML='';});
const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('active',a.hash==='#'+entry.target.id));}},{rootMargin:'-170px 0px -60% 0px'});document.querySelectorAll('main section[id]').forEach(s=>observer.observe(s));
function initChartTooltips(){
 const tooltip=document.createElement('div');tooltip.id='chartTooltip';tooltip.setAttribute('role','tooltip');document.body.appendChild(tooltip);
 let lastSvg=null;
 const hide=()=>{tooltip.hidden=true;if(lastSvg)lastSvg.querySelectorAll('.hoverPoint').forEach(p=>p.classList.remove('hoverPoint'));lastSvg=null;};
 hide();
 document.addEventListener('pointermove',event=>{
  const svg=event.target.closest?.('.chart svg');if(!svg){hide();return;}
  const circles=[...svg.querySelectorAll('circle')];let nearest=null,distance=18;
  for(const circle of circles){const rect=circle.getBoundingClientRect(),d=Math.hypot(event.clientX-(rect.left+rect.width/2),event.clientY-(rect.top+rect.height/2));if(d<distance){distance=d;nearest=circle;}}
  if(!nearest){hide();return;}
  if(lastSvg)lastSvg.querySelectorAll('.hoverPoint').forEach(p=>p.classList.remove('hoverPoint'));lastSvg=svg;
  const x=Number(nearest.getAttribute('cx'));
  const related=circles.filter(p=>Math.abs(Number(p.getAttribute('cx'))-x)<.5);
  const lines=related.map(point=>{const title=point.querySelector('title');if(title){point.dataset.tooltip=title.textContent;title.remove();}point.classList.add('hoverPoint');return point.dataset.tooltip||'';}).filter(Boolean);
  if(!lines.length){hide();return;}
  tooltip.replaceChildren(...lines.map(line=>{const row=document.createElement('div');row.textContent=line;return row;}));tooltip.hidden=false;
  const rect=tooltip.getBoundingClientRect();tooltip.style.left=Math.max(8,Math.min(event.clientX+16,window.innerWidth-rect.width-8))+'px';tooltip.style.top=Math.max(8,Math.min(event.clientY+16,window.innerHeight-rect.height-8))+'px';
 });
 document.addEventListener('pointerleave',hide);window.addEventListener('scroll',hide,true);window.addEventListener('blur',hide);
}
$('rankingMetric').addEventListener('change',render);
initChartTooltips();
initPerformance();
if(sharedMode){$('importBtn').textContent='管理发布数据 ↗';$('importBtn').title='管理员更新仓库中的 data.json，部署完成后所有访客同步';setInterval(()=>{if(!document.hidden)load(true);},30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load(true);});}
load();
