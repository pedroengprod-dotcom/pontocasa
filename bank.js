(()=>{
'use strict';
const VERSION='0.12.1';
const SIM_MODE_KEY='pc-simulation-mode';
let bankEmployeeId=null;
let bankMonth=localStorage.getItem(SIM_MODE_KEY)==='1'?'2026-08':new Date().toLocaleDateString('en-CA').slice(0,7);
let justifiedDate=null;

const JUSTIFIED_REASONS=[
  ['medical_certificate','Atestado médico / doença','social_security'],
  ['bereavement','Falecimento de familiar','employer_paid'],
  ['marriage','Casamento','employer_paid'],
  ['birth_adoption_guard','Nascimento, adoção ou guarda compartilhada','employer_paid'],
  ['blood_donation','Doação voluntária de sangue','employer_paid'],
  ['electoral_registration','Alistamento eleitoral','employer_paid'],
  ['military_service','Serviço militar / obrigação legal','employer_paid'],
  ['university_exam','Prova de vestibular','employer_paid'],
  ['court_appearance','Comparecimento a juízo','employer_paid'],
  ['union_meeting','Reunião oficial sindical internacional','employer_paid'],
  ['pregnancy_appointments','Acompanhamento de esposa/companheira gestante','employer_paid'],
  ['child_medical','Acompanhamento de filho de até 6 anos em consulta','employer_paid'],
  ['cancer_prevention','Exames preventivos de câncer','employer_paid'],
  ['employer_waiver','Dispensa / abono concedido pelo empregador','employer_paid'],
  ['other_legal','Outro motivo legalmente justificado','employer_paid']
];

function state(){return window.pcGetState?window.pcGetState():null}
function save(){if(window.pcSaveState)window.pcSaveState()}
function toast(m){if(window.toast)window.toast(m)}
function fmtMin(m){
  if(window.fmtMin)return window.fmtMin(m);
  if(m==null)return '—';
  const sign=m<0?'-':m>0?'+':'';
  const n=Math.abs(Math.round(m)),h=Math.floor(n/60),mm=n%60;
  return sign+h+'h'+String(mm).padStart(2,'0');
}
function localDateKey(v){return window.localDateKey?window.localDateKey(v):new Date(v).toLocaleDateString('en-CA')}
function dayHours(e,date){return window.dayHours?window.dayHours(e,date):{planned:0,worked:null,balance:null,extra:null,pending:null,status:'',events:[],missing:[]}}
function periodDays(e,from,to){return window.periodDays?window.periodDays(e,from,to):[]}
function employeeById(id){const s=state();return s&&s.employees?s.employees.find(x=>x.id===id):null}
function isSimulation(){return localStorage.getItem(SIM_MODE_KEY)==='1'}
function monthBounds(month){const p=month.split('-').map(Number);return{from:month+'-01',to:new Date(p[0],p[1],0).toLocaleDateString('en-CA')}}
function monthAdd(month,n){const p=month.split('-').map(Number),d=new Date(p[0],p[1]-1+n,1,12);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function addOneYear(dateKey){const d=new Date(dateKey+'T12:00:00');d.setFullYear(d.getFullYear()+1);return d.toLocaleDateString('en-CA')}
function reasonMeta(code){return JUSTIFIED_REASONS.find(x=>x[0]===code)||['other_legal','Outro motivo legalmente justificado','employer_paid']}
function reasonLabel(code){return reasonMeta(code)[1]}
function ensureCollections(){
  const s=state();if(!s)return;
  s.hourBankAgreements=s.hourBankAgreements||[];
  s.worktimeDeficitTreatments=s.worktimeDeficitTreatments||[];
}
function agreementForDate(e,dateKey){
  const s=state();if(!s||!e)return null;
  return (s.hourBankAgreements||[]).filter(a=>a.employeeId===e.id&&a.writtenAgreementConfirmed&&a.validFrom<=dateKey&&(!a.validTo||a.validTo>=dateKey)).sort((a,b)=>String(b.validFrom).localeCompare(String(a.validFrom)))[0]||null;
}
function latestOpenAgreement(e){
  const s=state();if(!s||!e)return null;
  return (s.hourBankAgreements||[]).filter(a=>a.employeeId===e.id&&a.writtenAgreementConfirmed&&!a.validTo).sort((a,b)=>String(b.validFrom).localeCompare(String(a.validFrom)))[0]||null;
}
function activeTreatments(employeeId){
  const s=state();return ((s&&s.worktimeDeficitTreatments)||[]).filter(x=>x.employeeId===employeeId&&x.status!=='Cancelado');
}
function treatmentForDate(employeeId,date){return activeTreatments(employeeId).find(x=>x.date===date)||null}
function quantifiableDeficit(e,date){
  const d=dayHours(e,date);
  if(!d.planned)return 0;
  if(d.worked!=null&&d.balance!=null)return Math.max(0,-d.balance);
  if(d.worked==null&&(!d.events||d.events.length===0)&&d.status==='Sem marcação')return d.planned;
  return null;
}
function deficitDays(e,month){
  const b=monthBounds(month);
  return periodDays(e,b.from,b.to).filter(d=>d.planned>0).map(d=>{
    const deficit=quantifiableDeficit(e,d.dateKey),t=treatmentForDate(e.id,d.dateKey);
    return{day:d,deficit,treatment:t};
  }).filter(x=>x.deficit===null||x.deficit>0||x.treatment);
}
function treatmentMinutes(e,month,type){
  return activeTreatments(e.id).filter(x=>x.date.slice(0,7)===month&&x.type===type&&(type!=='compensation'||agreementForDate(e,x.date))).reduce((n,x)=>n+x.minutes,0);
}
function monthRaw(e,month){
  const b=monthBounds(month),days=periodDays(e,b.from,b.to).filter(d=>agreementForDate(e,d.dateKey));
  const extra=days.reduce((n,d)=>n+Math.max(0,d.extra||0),0);
  const compensation=treatmentMinutes(e,month,'compensation');
  const deductible=treatmentMinutes(e,month,'absence');
  const justified=treatmentMinutes(e,month,'justified');
  const sameMonthComp=Math.min(compensation,Math.min(extra,2400));
  const payable=Math.max(0,Math.min(extra,2400)-sameMonthComp);
  const credit=Math.max(0,extra-2400);
  const bankNeed=Math.max(0,compensation-sameMonthComp);
  const unclassified=deficitDays(e,month).filter(x=>x.deficit>0&&!x.treatment).reduce((n,x)=>n+x.deficit,0);
  const incomplete=deficitDays(e,month).filter(x=>x.deficit===null&&!x.treatment).length;
  return{month,extra,compensation,sameMonthComp,payable,credit,bankNeed,deductible,justified,unclassified,incomplete,configured:days.length>0||!!agreementForDate(e,b.to)};
}
function firstAgreementMonth(e){
  const s=state(),a=(s.hourBankAgreements||[]).filter(x=>x.employeeId===e.id&&x.writtenAgreementConfirmed).sort((x,y)=>x.validFrom.localeCompare(y.validFrom))[0];
  return a?a.validFrom.slice(0,7):null;
}
function ledgerAt(e,throughDate){
  const endMonth=throughDate.slice(0,7),startMonth=firstAgreementMonth(e);
  if(!startMonth)return{balance:0,expired:0,used:0,uncovered:0,created:0,ledger:[]};
  const lots=[],ledger=[];let expired=0,used=0,uncovered=0,created=0;
  function expireUntil(date){
    lots.forEach(l=>{
      if(!l.expired&&l.remaining>0&&l.expiresOn<date){
        expired+=l.remaining;
        ledger.push({type:'expired',date:l.expiresOn,minutes:l.remaining,originDate:l.originDate});
        l.remaining=0;l.expired=true;
      }
    });
  }
  for(let m=startMonth;m<=endMonth;m=monthAdd(m,1)){
    const b=monthBounds(m),raw=monthRaw(e,m);
    expireUntil(b.to);
    if(raw.credit>0){
      const lot={originDate:b.to,expiresOn:addOneYear(b.to),remaining:raw.credit,expired:false};
      lots.push(lot);created+=raw.credit;
      ledger.push({type:'credit',date:b.to,minutes:raw.credit,expiresOn:lot.expiresOn,month:m});
    }
    let need=raw.bankNeed,usedHere=0;
    lots.filter(l=>!l.expired&&l.remaining>0).sort((a,b)=>a.originDate.localeCompare(b.originDate)).forEach(l=>{
      if(need<=0)return;
      const take=Math.min(need,l.remaining);l.remaining-=take;need-=take;usedHere+=take;
    });
    if(raw.bankNeed>0){
      used+=usedHere;uncovered+=need;
      ledger.push({type:'use',date:b.to,minutes:usedHere,requested:raw.bankNeed,uncovered:need,month:m});
    }
  }
  expireUntil(throughDate);
  return{balance:lots.reduce((n,l)=>n+l.remaining,0),expired,used,uncovered,created,ledger:ledger.sort((a,b)=>b.date.localeCompare(a.date))};
}
function monthSummary(e,month){
  const raw=monthRaw(e,month),b=monthBounds(month),led=ledgerAt(e,b.to);
  const monthUse=led.ledger.filter(x=>x.type==='use'&&x.month===month).reduce((n,x)=>n+x.minutes,0);
  return Object.assign({},raw,{bankUses:monthUse,balance:led.balance,expired:led.expired,uncovered:led.uncovered});
}
window.pcBankMonthSummary=monthSummary;

function ensureSimulationBank(){
  if(!isSimulation())return;
  ensureCollections();
  const s=state();if(!s)return;
  if(!s.hourBankAgreements.some(a=>a.employeeId==='e1')){
    s.hourBankAgreements.push({id:'sim-bank-agreement',employeeId:'e1',validFrom:'2026-08-01',validTo:null,writtenAgreementConfirmed:true,note:'Acordo escrito fictício para testes',createdAt:'2026-08-01T08:00:00',simulation:true});
    save();
  }
}

function injectUI(){
  const pill=document.querySelector('#erMore .pillbar');
  if(pill&&!document.querySelector('[data-more="hourbank"]')){
    const b=document.createElement('button');b.dataset.more='hourbank';b.textContent='Banco de horas';pill.insertBefore(b,pill.children[1]||null);
    b.onclick=()=>{
      document.querySelectorAll('[data-more]').forEach(x=>x.classList.remove('active'));b.classList.add('active');
      ['moreReports','morePendings','moreAdjustments','moreSettings'].forEach(id=>document.getElementById(id)?.classList.add('hidden'));
      document.getElementById('moreHourbank')?.classList.remove('hidden');renderBank();
    };
    document.querySelectorAll('[data-more]:not([data-more="hourbank"])').forEach(x=>x.addEventListener('click',()=>document.getElementById('moreHourbank')?.classList.add('hidden')));
  }
  if(!document.getElementById('moreHourbank')){
    const d=document.createElement('div');d.id='moreHourbank';d.className='hidden';
    d.innerHTML=
      '<div class="card"><b>Banco de horas</b><div class="grid2" style="margin-top:8px"><div><label>Empregado</label><select id="bankEmployee"></select></div><div><label>Mês</label><input id="bankMonth" type="month"></div></div><div class="small muted" style="margin-top:7px">Apuração provisória até o fechamento mensal.</div></div>'+
      '<div id="bankAgreementBox" class="card"></div>'+
      '<div id="hourBankSummary"></div>'+
      '<div class="card"><b>Diferenças a classificar</b><div class="small muted" style="margin-top:4px">O PontoCasa calcula automaticamente as horas a menos. Você só informa como tratá-las.</div><div id="deficitClassificationList" style="margin-top:10px"></div></div>'+
      '<div class="card"><b>Extrato do banco</b><div id="hourBankLedger" style="margin-top:10px"></div></div>'+
      '<div class="card"><b>Testes do motor</b><div id="hourBankTests" class="small" style="margin-top:7px"></div></div>';
    const anchor=document.getElementById('morePendings');anchor.parentNode.insertBefore(d,anchor);
    d.addEventListener('change',ev=>{
      if(ev.target.id==='bankEmployee'){bankEmployeeId=ev.target.value;justifiedDate=null;renderBank()}
      if(ev.target.id==='bankMonth'){bankMonth=ev.target.value;justifiedDate=null;renderBank()}
    });
    d.addEventListener('click',ev=>{
      if(ev.target.id==='saveBankAgreement')saveAgreement();
      if(ev.target.id==='closeBankAgreement')closeAgreement();
      if(ev.target.dataset.classify==='compensation')classifyDeficit(ev.target.dataset.date,'compensation');
      if(ev.target.dataset.classify==='absence')classifyDeficit(ev.target.dataset.date,'absence');
      if(ev.target.dataset.classify==='justified'){justifiedDate=ev.target.dataset.date;renderBank()}
      if(ev.target.dataset.saveJustified)saveJustified(ev.target.dataset.saveJustified);
      if(ev.target.dataset.cancelTreatment)cancelTreatment(ev.target.dataset.cancelTreatment);
    });
  }
  if(!document.getElementById('employeeBankCard')){
    const home=document.getElementById('empHome'),card=document.createElement('div');card.id='employeeBankCard';card.className='card hidden';
    const recent=home.querySelector('#recent')?.closest('.card');if(recent)home.insertBefore(card,recent);else home.appendChild(card);
  }
}

function agreementBox(e){
  const box=document.getElementById('bankAgreementBox');if(!box)return;
  const active=latestOpenAgreement(e);
  if(active){
    box.innerHTML='<b>Regime de compensação</b><div class="note" style="margin-top:8px"><b style="color:var(--good)">Ativo</b><br>Vigência desde '+new Date(active.validFrom+'T12:00:00').toLocaleDateString('pt-BR')+'<br>Acordo escrito confirmado'+(active.note?'<br>'+active.note:'')+'</div><button id="closeBankAgreement" class="secondary" style="margin-top:10px;color:var(--bad)">Encerrar regime hoje</button>';
  }else{
    box.innerHTML='<b>Configurar regime de compensação</b><div class="small muted" style="margin-top:5px">Ative somente quando existir acordo escrito entre empregador e empregado.</div><label>Vigência</label><input id="bankValidFrom" type="date" value="'+(e.admission||localDateKey(new Date()))+'"><label style="font-weight:500"><input id="bankAgreementConfirmed" type="checkbox"> Confirmo que existe acordo escrito</label><label>Observação</label><input id="bankAgreementNote" placeholder="Ex.: acordo assinado em 01/08/2026"><button id="saveBankAgreement" class="primary" style="margin-top:10px">Ativar banco de horas</button>';
  }
}
function treatmentLabel(t){
  if(t.type==='compensation')return'Compensar com horas extras / banco';
  if(t.type==='absence')return'Falta / atraso';
  return'Ausência justificada / abonada · '+reasonLabel(t.reasonCode);
}
function justifiedForm(date){
  const options=JUSTIFIED_REASONS.map(x=>'<option value="'+x[0]+'">'+x[1]+'</option>').join('');
  return '<div class="note" style="margin-top:10px"><b>Motivo da ausência justificada</b><label>Motivo</label><select id="justifiedReason-'+date+'">'+options+'</select><label>Observação</label><input id="justifiedNote-'+date+'" placeholder="Opcional"><button class="primary" style="margin-top:8px" data-save-justified="'+date+'">Confirmar ausência justificada</button></div>';
}
function deficitListHtml(e,month){
  const rows=deficitDays(e,month);
  if(!rows.length)return'<div class="small muted">Nenhuma diferença negativa para classificar neste mês.</div>';
  return rows.map(x=>{
    const d=x.day,date=d.dateKey,t=x.treatment,calc=x.deficit;
    const header='<div><b>'+new Date(date+'T12:00:00').toLocaleDateString('pt-BR')+'</b><div class="small muted">Previsto '+fmtMin(d.planned)+' · Trabalhado '+fmtMin(d.worked)+' · Diferença '+(calc==null?'indeterminada':fmtMin(-calc))+'</div></div>';
    if(calc===null&&!t)return'<div class="card" style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;gap:8px">'+header+'<span class="status warn">Corrigir ponto</span></div><div class="small muted" style="margin-top:7px">Há marcações incompletas. Corrija as batidas antes de classificar essa diferença.</div></div>';
    if(t){
      const mismatch=calc!=null&&Math.round(calc)!==Math.round(t.minutes);
      return'<div class="card" style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;gap:8px">'+header+'<span class="status ok">Classificado</span></div><div class="small" style="margin-top:8px"><b>'+treatmentLabel(t)+'</b> · '+fmtMin(t.minutes)+(t.note?' · '+t.note:'')+'</div>'+(mismatch?'<div class="note" style="margin-top:7px;color:var(--warn)">O cálculo atual mudou. Cancele e classifique novamente para atualizar.</div>':'')+'<button class="secondary" style="margin-top:8px;color:var(--bad)" data-cancel-treatment="'+t.id+'">Cancelar classificação</button></div>';
    }
    const canComp=!!agreementForDate(e,date);return'<div class="card" style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;gap:8px">'+header+'<span class="status warn">Pendente</span></div><div class="grid3" style="margin-top:10px"><button class="secondary" data-classify="compensation" data-date="'+date+'" '+(canComp?'':'disabled')+'>Compensar</button><button class="secondary" data-classify="absence" data-date="'+date+'">Falta / atraso</button><button class="secondary" data-classify="justified" data-date="'+date+'">Justificada / abonada</button></div>'+(!canComp?'<div class="small muted" style="margin-top:6px">Compensação indisponível: não há acordo de banco vigente nessa data.</div>':'')+(justifiedDate===date?justifiedForm(date):'')+'</div>';
  }).join('');
}
function ledgerHtml(e,to){
  const led=ledgerAt(e,to);
  return led.ledger.map(x=>{
    let label='',amount=0,note='';
    if(x.type==='credit'){label='Crédito gerado no banco';amount=x.minutes;note='Vencimento: '+new Date(x.expiresOn+'T12:00:00').toLocaleDateString('pt-BR')}
    if(x.type==='use'){label='Crédito utilizado automaticamente';amount=-x.minutes;note='Compensação classificada no mês '+x.month+(x.uncovered?' · '+fmtMin(x.uncovered)+' sem crédito suficiente':'')}
    if(x.type==='expired'){label='Crédito vencido / a regularizar';amount=-x.minutes;note='Origem '+new Date(x.originDate+'T12:00:00').toLocaleDateString('pt-BR')}
    return'<div class="row"><div><b>'+new Date(x.date+'T12:00:00').toLocaleDateString('pt-BR')+' · '+label+'</b><div class="small muted">'+note+'</div></div><b>'+fmtMin(amount)+'</b></div>';
  }).join('')||'<div class="small muted">Nenhuma movimentação de crédito.</div>';
}

function renderBank(){
  injectUI();ensureCollections();ensureSimulationBank();
  const s=state();if(!s||!s.employees||!s.employees.length)return;
  const sel=document.getElementById('bankEmployee'),monthEl=document.getElementById('bankMonth');
  const prev=bankEmployeeId||sel.value||s.employees[0].id;
  sel.innerHTML=s.employees.map(e=>'<option value="'+e.id+'">'+e.name+'</option>').join('');
  bankEmployeeId=s.employees.some(e=>e.id===prev)?prev:s.employees[0].id;sel.value=bankEmployeeId;
  if(!monthEl.value)monthEl.value=bankMonth;bankMonth=monthEl.value||bankMonth;
  const e=employeeById(bankEmployeeId),b=monthBounds(bankMonth),sum=monthSummary(e,bankMonth),agreement=agreementForDate(e,b.to);
  agreementBox(e);
  const summary=document.getElementById('hourBankSummary');
  if(agreement){
    summary.innerHTML='<div class="grid2">'+
      '<div class="card"><div class="small muted">Horas extras geradas</div><b>'+fmtMin(sum.extra)+'</b></div>'+
      '<div class="card"><div class="small muted">Compensadas no próprio mês</div><b>'+fmtMin(sum.sameMonthComp)+'</b></div>'+
      '<div class="card"><div class="small muted">Horas extras a pagar</div><b>'+fmtMin(sum.payable)+'</b></div>'+
      '<div class="card"><div class="small muted">Crédito gerado no banco</div><b>'+fmtMin(sum.credit)+'</b></div>'+
      '<div class="card"><div class="small muted">Crédito usado do banco</div><b>'+fmtMin(sum.bankUses)+'</b></div>'+
      '<div class="card"><div class="small muted">Saldo disponível</div><b>'+fmtMin(sum.balance)+'</b></div>'+
      '<div class="card"><div class="small muted">Falta / atraso classificado</div><b>'+fmtMin(sum.deductible)+'</b></div>'+
      '<div class="card"><div class="small muted">Justificada / abonada</div><b>'+fmtMin(sum.justified)+'</b></div>'+
      '</div>'+
      ((sum.unclassified||sum.incomplete)?'<div class="note" style="margin-bottom:12px;color:var(--warn)"><b>Pendências de fechamento:</b> '+(sum.unclassified?fmtMin(sum.unclassified)+' ainda sem classificação. ':'')+(sum.incomplete?sum.incomplete+' dia(s) com ponto incompleto.':'')+'</div>':'');
  }else summary.innerHTML='<div class="card"><span class="status warn">Banco não configurado para este período</span></div>';
  document.getElementById('deficitClassificationList').innerHTML=deficitListHtml(e,bankMonth);
  document.getElementById('hourBankLedger').innerHTML=agreement?ledgerHtml(e,b.to):'<div class="small muted">Banco não configurado.</div>';
  document.getElementById('hourBankTests').innerHTML=runTestsHtml();

  const calEmpId=document.getElementById('calEmployee')?.value||s.employees[0].id,calE=employeeById(calEmpId),calM=document.getElementById('calMonth')?.value;
  if(calE&&calM){const cb=monthBounds(calM),card=document.querySelector('#calSummary .card:last-child b');if(card)card.textContent=agreementForDate(calE,cb.to)?fmtMin(ledgerAt(calE,cb.to).balance):'Não configurado'}
  const rangeTo=document.getElementById('reportTo')?.value||localDateKey(new Date()),reportCard=document.querySelector('#reportHoursSummary .card:last-child b');
  if(reportCard){const configured=s.employees.filter(x=>agreementForDate(x,rangeTo));reportCard.textContent=configured.length?fmtMin(configured.reduce((n,x)=>n+ledgerAt(x,rangeTo).balance,0)):'Não configurado'}
  const emp=s.employees[0],home=document.getElementById('employeeBankCard'),today=localDateKey(new Date()),a=agreementForDate(emp,today);
  if(home){home.classList.toggle('hidden',!a);if(a){const ms=monthSummary(emp,today.slice(0,7));home.innerHTML='<b>Banco de horas</b><div class="small muted" style="margin-top:5px">Saldo disponível: <b>'+fmtMin(ledgerAt(emp,today).balance)+'</b> · horas extras do mês: '+fmtMin(ms.extra)+' · compensadas no mês: '+fmtMin(ms.sameMonthComp)+'</div>'}}
}
window.pcRenderBank=renderBank;

async function context(){
  const sb=window.pontoCasaSupabase;if(!sb)return null;
  const sess=(await sb.auth.getSession()).data.session;if(!sess)return null;
  const q=await sb.from('household_members').select('household_id,role').eq('user_id',sess.user.id).limit(1);
  if(q.error||!q.data?.length)return null;
  return{sb,session:sess,householdId:q.data[0].household_id,role:q.data[0].role};
}
async function loadCloudBank(){
  if(isSimulation())return;
  const ctx=await context();if(!ctx)return;
  const s=state();if(!s)return;ensureCollections();
  const map=new Map((s.employees||[]).filter(e=>e.cloudId).map(e=>[e.cloudId,e.id]));
  if(!map.size){setTimeout(loadCloudBank,700);return}
  const a=await ctx.sb.from('hour_bank_agreements').select('*').order('valid_from');
  const t=await ctx.sb.from('worktime_deficit_treatments').select('*').order('treatment_date');
  if(a.error||t.error){console.error(a.error||t.error);return}
  s.hourBankAgreements=(a.data||[]).map(x=>({id:x.id,employeeId:map.get(x.employee_id)||x.employee_id,validFrom:x.valid_from,validTo:x.valid_to||null,writtenAgreementConfirmed:!!x.written_agreement_confirmed,note:x.note||'',createdAt:x.created_at}));
  s.worktimeDeficitTreatments=(t.data||[]).map(x=>({id:x.id,employeeId:map.get(x.employee_id)||x.employee_id,date:x.treatment_date,minutes:x.minutes,type:x.treatment_type,reasonCode:x.reason_code,financialEffect:x.financial_effect,note:x.note||'',status:x.status,createdAt:x.created_at,cancelledAt:x.cancelled_at||null,cancelReason:x.cancel_reason||''}));
  save();renderBank();
}
window.pcLoadBankData=loadCloudBank;

async function saveAgreement(){
  const e=employeeById(bankEmployeeId);if(!e)return;
  const date=document.getElementById('bankValidFrom').value,note=document.getElementById('bankAgreementNote').value.trim(),confirmed=document.getElementById('bankAgreementConfirmed').checked;
  if(!date){toast('Informe a data de vigência.');return}
  if(!confirmed){toast('Confirme a existência do acordo escrito.');return}
  if(!confirm('Ativar banco de horas a partir de '+new Date(date+'T12:00:00').toLocaleDateString('pt-BR')+'?'))return;
  if(isSimulation()){
    state().hourBankAgreements.push({id:'sim-bank-'+Date.now(),employeeId:e.id,validFrom:date,validTo:null,writtenAgreementConfirmed:true,note,createdAt:new Date().toISOString(),simulation:true});save();renderBank();return;
  }
  const ctx=await context();if(!ctx||!['owner','admin'].includes(ctx.role)){alert('Apenas o empregador/administrador pode configurar o banco.');return}
  if(!e.cloudId){alert('Empregado ainda não sincronizado.');return}
  const open=await ctx.sb.from('hour_bank_agreements').select('id').eq('employee_id',e.cloudId).is('valid_to',null).limit(1);
  if(open.error)throw open.error;if(open.data?.length){alert('Já existe um acordo ativo.');return}
  const r=await ctx.sb.from('hour_bank_agreements').insert({household_id:ctx.householdId,employee_id:e.cloudId,valid_from:date,written_agreement_confirmed:true,note:note||null});
  if(r.error){alert('Não foi possível ativar: '+r.error.message);return}await loadCloudBank();
}
async function closeAgreement(){
  const e=employeeById(bankEmployeeId),a=latestOpenAgreement(e);if(!a)return;
  const end=localDateKey(new Date());if(!confirm('Encerrar o regime hoje ('+new Date(end+'T12:00:00').toLocaleDateString('pt-BR')+')?'))return;
  if(isSimulation()){a.validTo=end;save();renderBank();return}
  const ctx=await context();if(!ctx||!['owner','admin'].includes(ctx.role))return;
  const r=await ctx.sb.from('hour_bank_agreements').update({valid_to:end,updated_at:new Date().toISOString()}).eq('id',a.id);
  if(r.error){alert('Não foi possível encerrar: '+r.error.message);return}await loadCloudBank();
}
async function persistTreatment(e,date,type,reasonCode,financialEffect,note){
  const minutes=quantifiableDeficit(e,date);
  if(minutes==null||minutes<=0){toast('Não há diferença quantificável para classificar nesse dia.');return}
  if(treatmentForDate(e.id,date)){toast('Esse dia já está classificado.');return}
  if(type==='compensation'&&!agreementForDate(e,date)){toast('Não há acordo de banco vigente nessa data.');return}
  if(isSimulation()){
    state().worktimeDeficitTreatments.push({id:'sim-treatment-'+Date.now(),employeeId:e.id,date,minutes,type,reasonCode,financialEffect,note:note||'',status:'Ativo',createdAt:new Date().toISOString(),simulation:true});
    save();justifiedDate=null;renderBank();return;
  }
  const ctx=await context();if(!ctx||!['owner','admin'].includes(ctx.role)){alert('Ação não autorizada.');return}
  const r=await ctx.sb.from('worktime_deficit_treatments').insert({
    household_id:ctx.householdId,employee_id:e.cloudId,treatment_date:date,minutes,
    treatment_type:type,reason_code:reasonCode,financial_effect:financialEffect,note:note||null
  });
  if(r.error){alert('Não foi possível classificar: '+r.error.message);return}
  justifiedDate=null;await loadCloudBank();
}
async function classifyDeficit(date,type){
  const e=employeeById(bankEmployeeId);if(!e)return;
  if(type==='compensation')return persistTreatment(e,date,'compensation','automatic_bank','bank','');
  if(type==='absence')return persistTreatment(e,date,'absence','absence_or_delay','deductible','');
}
async function saveJustified(date){
  const e=employeeById(bankEmployeeId);if(!e)return;
  const sel=document.getElementById('justifiedReason-'+date),note=document.getElementById('justifiedNote-'+date);
  const meta=reasonMeta(sel?sel.value:'other_legal');
  return persistTreatment(e,date,'justified',meta[0],meta[2],note?note.value.trim():'');
}
async function cancelTreatment(id){
  const s=state(),x=(s.worktimeDeficitTreatments||[]).find(t=>t.id===id);if(!x)return;
  const reason=prompt('Motivo do cancelamento:','Classificação incorreta');if(!reason)return;
  if(isSimulation()){x.status='Cancelado';x.cancelReason=reason;x.cancelledAt=new Date().toISOString();save();renderBank();return}
  const ctx=await context();if(!ctx||!['owner','admin'].includes(ctx.role))return;
  const r=await ctx.sb.from('worktime_deficit_treatments').update({status:'Cancelado',cancelled_at:new Date().toISOString(),cancelled_by_user_id:ctx.session.user.id,cancel_reason:reason}).eq('id',id);
  if(r.error){alert('Não foi possível cancelar: '+r.error.message);return}await loadCloudBank();
}

function runTests(){
  if(!window.buildSimulationState||!window.pcSetState)return[];
  const original=state(),test=window.buildSimulationState();
  test.hourBankAgreements=[{id:'t-a',employeeId:'e1',validFrom:'2026-08-01',validTo:null,writtenAgreementConfirmed:true,note:''}];
  test.worktimeDeficitTreatments=[];
  window.pcSetState(test);
  const e=test.employees[0],out=[],check=(name,a,b)=>out.push({name,ok:a===b,a,b});
  try{
    let a=monthSummary(e,'2026-08');
    check('Agosto extras',Math.round(a.extra),2520);
    check('Agosto a pagar',Math.round(a.payable),2400);
    check('Agosto crédito',Math.round(a.credit),120);
    check('Agosto saldo',Math.round(a.balance),120);

    let s=monthSummary(e,'2026-09');
    check('Setembro extras',Math.round(s.extra),105);
    check('Déficit sem classificação não reduz banco',Math.round(s.balance),120);
    check('Déficit automático detectado',Math.round(s.unclassified),30);

    test.worktimeDeficitTreatments.push({id:'t-comp',employeeId:e.id,date:'2026-09-03',minutes:30,type:'compensation',reasonCode:'automatic_bank',financialEffect:'bank',note:'',status:'Ativo'});
    s=monthSummary(e,'2026-09');
    check('Compensação automática no mês',Math.round(s.sameMonthComp),30);
    check('Horas a pagar após compensação',Math.round(s.payable),75);
    check('Saldo anterior preservado',Math.round(s.balance),120);

    test.worktimeDeficitTreatments[0].status='Cancelado';
    test.worktimeDeficitTreatments.push({id:'t-absence',employeeId:e.id,date:'2026-09-03',minutes:30,type:'absence',reasonCode:'absence_or_delay',financialEffect:'deductible',note:'',status:'Ativo'});
    s=monthSummary(e,'2026-09');
    check('Falta/atraso não consome banco',Math.round(s.balance),120);
    check('Falta/atraso classificada',Math.round(s.deductible),30);

    test.worktimeDeficitTreatments[1].status='Cancelado';
    test.worktimeDeficitTreatments.push({id:'t-just',employeeId:e.id,date:'2026-09-03',minutes:30,type:'justified',reasonCode:'employer_waiver',financialEffect:'employer_paid',note:'',status:'Ativo'});
    s=monthSummary(e,'2026-09');
    check('Abono não consome banco',Math.round(s.balance),120);
    check('Ausência justificada classificada',Math.round(s.justified),30);
  }finally{window.pcSetState(original)}
  return out;
}
function runTestsHtml(){
  const r=runTests(),ok=r.filter(x=>x.ok).length;
  return'<b>'+ok+'/'+r.length+' aprovados</b>'+(ok===r.length?'':'<br>'+r.filter(x=>!x.ok).map(x=>x.name+': esperado '+x.b+', obtido '+x.a).join('<br>'));
}

injectUI();ensureCollections();ensureSimulationBank();renderBank();
setTimeout(loadCloudBank,500);setTimeout(loadCloudBank,1800);
if(window.pontoCasaSupabase)window.pontoCasaSupabase.auth.onAuthStateChange(()=>setTimeout(loadCloudBank,300));
document.addEventListener('click',()=>setTimeout(renderBank,0));
document.addEventListener('change',()=>setTimeout(renderBank,0));
})();