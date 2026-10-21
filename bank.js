(()=>{
'use strict';
const VERSION='0.12';
const SIM_MODE_KEY='pc-simulation-mode';
let bankEmployeeId=null;
let bankMonth=localStorage.getItem(SIM_MODE_KEY)==='1'?'2026-08':new Date().toLocaleDateString('en-CA').slice(0,7);

function state(){return window.pcGetState?window.pcGetState():null}
function save(){if(window.pcSaveState)window.pcSaveState()}
function fmtMin(m){
  if(window.fmtMin)return window.fmtMin(m);
  if(m==null)return '—';
  const sign=m<0?'-':m>0?'+':'';
  const n=Math.abs(Math.round(m)),h=Math.floor(n/60),mm=n%60;
  return sign+h+'h'+String(mm).padStart(2,'0');
}
function localDateKey(v){return window.localDateKey?window.localDateKey(v):new Date(v).toLocaleDateString('en-CA')}
function employeeById(id){const s=state();return s&&s.employees?s.employees.find(x=>x.id===id):null}
function isSimulation(){return localStorage.getItem(SIM_MODE_KEY)==='1'}
function monthBounds(month){const p=month.split('-').map(Number);return{from:month+'-01',to:new Date(p[0],p[1],0).toLocaleDateString('en-CA')}}
function durationToMin(v){const m=String(v||'').trim().match(/^(\d{1,3}):([0-5]\d)$/);return m?Number(m[1])*60+Number(m[2]):null}
function addOneYear(dateKey){const d=new Date(dateKey+'T12:00:00');d.setFullYear(d.getFullYear()+1);return d.toLocaleDateString('en-CA')}
function agreementForDate(e,dateKey){
  const s=state();if(!s||!e)return null;
  return (s.hourBankAgreements||[]).filter(a=>a.employeeId===e.id&&a.writtenAgreementConfirmed&&a.validFrom<=dateKey&&(!a.validTo||a.validTo>=dateKey)).sort((a,b)=>String(b.validFrom).localeCompare(String(a.validFrom)))[0]||null;
}
function latestOpenAgreement(e){
  const s=state();if(!s||!e)return null;
  return (s.hourBankAgreements||[]).filter(a=>a.employeeId===e.id&&a.writtenAgreementConfirmed&&!a.validTo).sort((a,b)=>String(b.validFrom).localeCompare(String(a.validFrom)))[0]||null;
}
function activeComps(employeeId){
  const s=state();return ((s&&s.hourBankCompensations)||[]).filter(x=>x.employeeId===employeeId&&x.status!=='Cancelado');
}
function dayHours(e,date){return window.dayHours?window.dayHours(e,date):{extra:0,pending:0,worked:null}}
function periodDays(e,from,to){return window.periodDays?window.periodDays(e,from,to):[]}

function creditCreationEvents(e,throughDate){
  const s=state(),agreements=(s.hourBankAgreements||[]).filter(a=>a.employeeId===e.id&&a.writtenAgreementConfirmed).sort((a,b)=>a.validFrom.localeCompare(b.validFrom));
  if(!agreements.length)return[];
  const first=agreements[0].validFrom,monthly={},events=[];
  for(let d=new Date(first+'T12:00:00'),last=new Date(throughDate+'T12:00:00');d<=last;d.setDate(d.getDate()+1)){
    const key=d.toLocaleDateString('en-CA');if(!agreementForDate(e,key))continue;
    const extra=Math.max(0,dayHours(e,key).extra||0),mk=key.slice(0,7),before=monthly[mk]||0,after=before+extra;
    const credit=Math.max(0,after-2400)-Math.max(0,before-2400);
    monthly[mk]=after;
    if(credit>0)events.push({type:'credit',date:key,minutes:credit,expiresOn:addOneYear(key)});
  }
  return events;
}
function ledgerAt(e,throughDate){
  const credits=creditCreationEvents(e,throughDate);
  const uses=activeComps(e.id).filter(x=>x.kind==='bank_credit'&&x.date<=throughDate).map(x=>({type:'use',date:x.date,minutes:x.minutes,id:x.id,reason:x.reason,note:x.note||''}));
  const events=credits.concat(uses).sort((a,b)=>a.date.localeCompare(b.date)||(a.type==='credit'?-1:1));
  const lots=[],ledger=[];let expired=0,used=0,uncovered=0;
  function expireUntil(date){
    lots.forEach(l=>{
      if(!l.expired&&l.remaining>0&&l.expiresOn<date){
        expired+=l.remaining;ledger.push({type:'expired',date:l.expiresOn,minutes:l.remaining,originDate:l.originDate});
        l.remaining=0;l.expired=true;
      }
    });
  }
  events.forEach(ev=>{
    expireUntil(ev.date);
    if(ev.type==='credit'){
      lots.push({originDate:ev.date,expiresOn:ev.expiresOn,original:ev.minutes,remaining:ev.minutes,expired:false});
      ledger.push({type:'credit',date:ev.date,minutes:ev.minutes,expiresOn:ev.expiresOn});
    }else{
      let need=ev.minutes,usedHere=0;
      lots.filter(l=>!l.expired&&l.remaining>0&&l.originDate<=ev.date).sort((a,b)=>a.originDate.localeCompare(b.originDate)).forEach(l=>{
        if(need<=0)return;const take=Math.min(need,l.remaining);l.remaining-=take;need-=take;usedHere+=take;
      });
      used+=usedHere;uncovered+=need;
      ledger.push({type:'use',date:ev.date,minutes:usedHere,requested:ev.minutes,uncovered:need,reason:ev.reason,note:ev.note,id:ev.id});
    }
  });
  expireUntil(throughDate);
  return{balance:lots.reduce((n,l)=>n+l.remaining,0),expired,used,uncovered,created:credits.reduce((n,x)=>n+x.minutes,0),ledger:ledger.sort((a,b)=>b.date.localeCompare(a.date))};
}
function monthSummary(e,month){
  const b=monthBounds(month),days=periodDays(e,b.from,b.to).filter(d=>agreementForDate(e,d.dateKey));
  const extra=days.reduce((n,d)=>n+Math.max(0,d.extra||0),0);
  const same=activeComps(e.id).filter(x=>x.kind==='same_month'&&x.date.slice(0,7)===month&&agreementForDate(e,x.date)).reduce((n,x)=>n+x.minutes,0);
  const first40=Math.min(extra,2400),sameApplied=Math.min(same,first40),payable=Math.max(0,first40-sameApplied),credit=Math.max(0,extra-2400);
  const led=ledgerAt(e,b.to),bankUses=led.ledger.filter(x=>x.type==='use'&&x.date.slice(0,7)===month).reduce((n,x)=>n+x.minutes,0);
  return{month,extra,sameMonth:sameApplied,payable,credit,bankUses,balance:led.balance,expired:led.expired,configured:days.length>0||!!agreementForDate(e,b.to)};
}
function remainingShortage(e,date){
  const shortage=Math.max(0,dayHours(e,date).pending||0);
  const used=activeComps(e.id).filter(x=>x.date===date).reduce((n,x)=>n+x.minutes,0);
  return Math.max(0,shortage-used);
}

function ensureSimulationBank(){
  if(!isSimulation())return;
  const s=state();if(!s)return;
  s.hourBankAgreements=s.hourBankAgreements||[];s.hourBankCompensations=s.hourBankCompensations||[];
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
    d.innerHTML='<div class="card"><b>Banco de horas</b><div class="grid2" style="margin-top:8px"><div><label>Empregado</label><select id="bankEmployee"></select></div><div><label>Mês</label><input id="bankMonth" type="month"></div></div><div class="small muted" style="margin-top:7px">Apuração provisória até o fechamento mensal.</div></div>'+
    '<div id="bankAgreementBox" class="card"></div><div id="hourBankSummary"></div>'+
    '<div id="hourBankCompCard" class="card"><b>Registrar compensação</b><div class="small muted" style="margin-top:4px">Horas a menos não reduzem o banco automaticamente. Registre aqui apenas uma compensação efetivamente acordada/realizada.</div><div class="grid2"><div><label>Data</label><input id="bankCompDate" type="date"></div><div><label>Duração</label><input id="bankCompDuration" type="text" inputmode="numeric" placeholder="00:30"></div></div><label>Origem</label><select id="bankCompKind"><option value="same_month">Compensar horas extras do próprio mês</option><option value="bank_credit">Usar crédito do banco</option></select><label>Motivo</label><select id="bankCompReason"><option>Redução de jornada</option><option>Dia útil não trabalhado</option><option>Outro</option></select><label>Observação</label><input id="bankCompNote" placeholder="Opcional"><div id="bankCompHint" class="note" style="margin-top:10px"></div><button id="saveBankComp" class="primary" style="margin-top:10px">Registrar compensação</button></div>'+
    '<div class="card"><b>Extrato</b><div id="hourBankLedger" style="margin-top:10px"></div></div>'+
    '<div class="card"><b>Testes do motor</b><div id="hourBankTests" class="small" style="margin-top:7px"></div></div>';
    const anchor=document.getElementById('morePendings');anchor.parentNode.insertBefore(d,anchor);
    d.addEventListener('change',ev=>{
      if(ev.target.id==='bankEmployee'){bankEmployeeId=ev.target.value;renderBank()}
      if(ev.target.id==='bankMonth'){bankMonth=ev.target.value;renderBank()}
      if(ev.target.id==='bankCompDate'||ev.target.id==='bankCompKind')renderBank();
    });
    d.addEventListener('click',ev=>{
      if(ev.target.id==='saveBankAgreement')saveAgreement();
      if(ev.target.id==='closeBankAgreement')closeAgreement();
      if(ev.target.id==='saveBankComp')saveCompensation();
      if(ev.target.dataset.cancelBank)cancelCompensation(ev.target.dataset.cancelBank);
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
    box.innerHTML='<b>Configurar regime de compensação</b><div class="small muted" style="margin-top:5px">A LC 150 exige acordo escrito entre empregador e empregado.</div><label>Vigência</label><input id="bankValidFrom" type="date" value="'+(e.admission||localDateKey(new Date()))+'"><label style="font-weight:500"><input id="bankAgreementConfirmed" type="checkbox"> Confirmo que existe acordo escrito</label><label>Observação</label><input id="bankAgreementNote" placeholder="Ex.: acordo assinado em 01/08/2026"><button id="saveBankAgreement" class="primary" style="margin-top:10px">Ativar banco de horas</button>';
  }
}
function ledgerHtml(e,to){
  const led=ledgerAt(e,to),same=activeComps(e.id).filter(x=>x.kind==='same_month'&&x.date<=to).map(x=>({type:'same',date:x.date,minutes:x.minutes,reason:x.reason,note:x.note,id:x.id}));
  const rows=led.ledger.concat(same).sort((a,b)=>b.date.localeCompare(a.date));
  return rows.map(x=>{
    let label='',amount=0,note='',cancel=false;
    if(x.type==='credit'){label='Crédito gerado no banco';amount=x.minutes;note='Vence em '+new Date(x.expiresOn+'T12:00:00').toLocaleDateString('pt-BR')}
    if(x.type==='use'){label='Uso de crédito do banco';amount=-x.minutes;note=x.reason+(x.note?' · '+x.note:'');cancel=true}
    if(x.type==='same'){label='Compensação no próprio mês';amount=-x.minutes;note=x.reason+(x.note?' · '+x.note:'');cancel=true}
    if(x.type==='expired'){label='Crédito vencido / a regularizar';amount=-x.minutes;note='Origem '+new Date(x.originDate+'T12:00:00').toLocaleDateString('pt-BR')}
    return '<div class="row"><div><b>'+new Date(x.date+'T12:00:00').toLocaleDateString('pt-BR')+' · '+label+'</b><div class="small muted">'+note+'</div></div><div style="text-align:right"><b>'+fmtMin(amount)+'</b>'+(cancel&&x.id?'<br><button class="secondary" style="width:auto;min-height:28px;padding:3px 8px;margin-top:4px" data-cancel-bank="'+x.id+'">Cancelar</button>':'')+'</div></div>';
  }).join('')||'<div class="small muted">Nenhuma movimentação.</div>';
}

function renderBank(){
  injectUI();ensureSimulationBank();
  const s=state();if(!s||!s.employees||!s.employees.length)return;
  const sel=document.getElementById('bankEmployee'),monthEl=document.getElementById('bankMonth');
  const prev=bankEmployeeId||sel.value||s.employees[0].id;
  sel.innerHTML=s.employees.map(e=>'<option value="'+e.id+'">'+e.name+'</option>').join('');
  bankEmployeeId=s.employees.some(e=>e.id===prev)?prev:s.employees[0].id;sel.value=bankEmployeeId;
  if(!monthEl.value)monthEl.value=bankMonth;bankMonth=monthEl.value||bankMonth;
  const e=employeeById(bankEmployeeId),b=monthBounds(bankMonth),sum=monthSummary(e,bankMonth),agreement=agreementForDate(e,b.to);
  agreementBox(e);
  document.getElementById('hourBankCompCard').classList.toggle('hidden',!agreement);
  const summary=document.getElementById('hourBankSummary');
  if(agreement){
    summary.innerHTML='<div class="grid2"><div class="card"><div class="small muted">Horas extras geradas</div><b>'+fmtMin(sum.extra)+'</b></div><div class="card"><div class="small muted">Compensadas no próprio mês</div><b>'+fmtMin(sum.sameMonth)+'</b></div><div class="card"><div class="small muted">Horas extras a pagar</div><b>'+fmtMin(sum.payable)+'</b></div><div class="card"><div class="small muted">Crédito gerado no banco</div><b>'+fmtMin(sum.credit)+'</b></div><div class="card"><div class="small muted">Crédito usado no mês</div><b>'+fmtMin(sum.bankUses)+'</b></div><div class="card"><div class="small muted">Saldo disponível no fim do mês</div><b>'+fmtMin(sum.balance)+'</b></div></div>';
  }else summary.innerHTML='<div class="card"><span class="status warn">Banco não configurado para este período</span></div>';
  if(agreement){
    const dateEl=document.getElementById('bankCompDate'),kind=document.getElementById('bankCompKind').value;
    if(!dateEl.value||dateEl.value.slice(0,7)!==bankMonth)dateEl.value=b.to;
    const date=dateEl.value,short=remainingShortage(e,date),m=monthSummary(e,date.slice(0,7)),bankAvailable=ledgerAt(e,date).balance;
    document.getElementById('bankCompHint').innerHTML='Horas a menos ainda disponíveis nesse dia: <b>'+fmtMin(short)+'</b><br>'+(kind==='same_month'?'Horas extras da faixa mensal ainda disponíveis para compensação: <b>'+fmtMin(Math.max(0,Math.min(m.extra,2400)-m.sameMonth))+'</b>':'Crédito de banco disponível até a data: <b>'+fmtMin(bankAvailable)+'</b>');
  }
  document.getElementById('hourBankLedger').innerHTML=ledgerHtml(e,b.to);
  document.getElementById('hourBankTests').innerHTML=runTestsHtml();

  const calEmpId=document.getElementById('calEmployee')?.value||s.employees[0].id,calE=employeeById(calEmpId),calM=document.getElementById('calMonth')?.value;
  if(calE&&calM){const cb=monthBounds(calM),card=document.querySelector('#calSummary .card:last-child b');if(card)card.textContent=agreementForDate(calE,cb.to)?fmtMin(ledgerAt(calE,cb.to).balance):'Não configurado'}
  const rangeTo=document.getElementById('reportTo')?.value||localDateKey(new Date()),reportCard=document.querySelector('#reportHoursSummary .card:last-child b');
  if(reportCard){const configured=s.employees.filter(x=>agreementForDate(x,rangeTo));reportCard.textContent=configured.length?fmtMin(configured.reduce((n,x)=>n+ledgerAt(x,rangeTo).balance,0)):'Não configurado'}
  const emp=s.employees[0],home=document.getElementById('employeeBankCard'),today=localDateKey(new Date()),a=agreementForDate(emp,today);
  if(home){home.classList.toggle('hidden',!a);if(a){const ms=monthSummary(emp,today.slice(0,7));home.innerHTML='<b>Banco de horas</b><div class="small muted" style="margin-top:5px">Saldo disponível: <b>'+fmtMin(ledgerAt(emp,today).balance)+'</b> · horas extras do mês: '+fmtMin(ms.extra)+' · compensadas no mês: '+fmtMin(ms.sameMonth)+'</div>'}}
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
  const s=state();if(!s)return;
  const map=new Map((s.employees||[]).filter(e=>e.cloudId).map(e=>[e.cloudId,e.id]));
  if(!map.size){setTimeout(loadCloudBank,700);return}
  const a=await ctx.sb.from('hour_bank_agreements').select('*').order('valid_from');
  const c=await ctx.sb.from('hour_bank_compensations').select('*').order('compensation_date');
  if(a.error||c.error){console.error(a.error||c.error);return}
  s.hourBankAgreements=(a.data||[]).map(x=>({id:x.id,employeeId:map.get(x.employee_id)||x.employee_id,validFrom:x.valid_from,validTo:x.valid_to||null,writtenAgreementConfirmed:!!x.written_agreement_confirmed,note:x.note||'',createdAt:x.created_at}));
  s.hourBankCompensations=(c.data||[]).map(x=>({id:x.id,employeeId:map.get(x.employee_id)||x.employee_id,date:x.compensation_date,kind:x.compensation_kind,minutes:x.minutes,reason:x.reason,note:x.note||'',status:x.status,createdAt:x.created_at,cancelledAt:x.cancelled_at||null,cancelReason:x.cancel_reason||''}));
  save();renderBank();
}
window.pcLoadBankData=loadCloudBank;

async function saveAgreement(){
  const e=employeeById(bankEmployeeId);if(!e)return;
  const date=document.getElementById('bankValidFrom').value,note=document.getElementById('bankAgreementNote').value.trim(),confirmed=document.getElementById('bankAgreementConfirmed').checked;
  if(!date){window.toast?.('Informe a data de vigência.');return}
  if(!confirmed){window.toast?.('Confirme a existência do acordo escrito.');return}
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
async function saveCompensation(){
  const e=employeeById(bankEmployeeId);if(!e)return;
  const date=document.getElementById('bankCompDate').value,minutes=durationToMin(document.getElementById('bankCompDuration').value),kind=document.getElementById('bankCompKind').value,reason=document.getElementById('bankCompReason').value,note=document.getElementById('bankCompNote').value.trim();
  if(!date||!minutes){window.toast?.('Informe data e duração como 00:30.');return}
  if(!agreementForDate(e,date)){window.toast?.('Não há acordo vigente nessa data.');return}
  const short=remainingShortage(e,date);if(short<minutes){window.toast?.('A compensação excede as horas a menos disponíveis nesse dia ('+fmtMin(short)+').');return}
  if(kind==='same_month'){
    const m=monthSummary(e,date.slice(0,7)),available=Math.max(0,Math.min(m.extra,2400)-m.sameMonth);
    if(available<minutes){window.toast?.('Não há horas extras suficientes no próprio mês.');return}
  }else{
    const available=ledgerAt(e,date).balance;if(available<minutes){window.toast?.('Saldo de banco insuficiente: '+fmtMin(available));return}
  }
  if(isSimulation()){
    state().hourBankCompensations.push({id:'sim-comp-'+Date.now(),employeeId:e.id,date,kind,minutes,reason,note,status:'Ativo',createdAt:new Date().toISOString(),simulation:true});save();document.getElementById('bankCompDuration').value='';renderBank();return;
  }
  const ctx=await context();if(!ctx||!['owner','admin'].includes(ctx.role)){alert('Ação não autorizada.');return}
  const r=await ctx.sb.from('hour_bank_compensations').insert({household_id:ctx.householdId,employee_id:e.cloudId,compensation_date:date,compensation_kind:kind,minutes,reason,note:note||null});
  if(r.error){alert('Não foi possível registrar: '+r.error.message);return}document.getElementById('bankCompDuration').value='';await loadCloudBank();
}
async function cancelCompensation(id){
  const s=state(),x=s.hourBankCompensations.find(c=>c.id===id);if(!x)return;
  const reason=prompt('Motivo do cancelamento:','Lançamento incorreto');if(!reason)return;
  if(isSimulation()){x.status='Cancelado';x.cancelReason=reason;x.cancelledAt=new Date().toISOString();save();renderBank();return}
  const ctx=await context();if(!ctx||!['owner','admin'].includes(ctx.role))return;
  const r=await ctx.sb.from('hour_bank_compensations').update({status:'Cancelado',cancelled_at:new Date().toISOString(),cancelled_by_user_id:ctx.session.user.id,cancel_reason:reason}).eq('id',id);
  if(r.error){alert('Não foi possível cancelar: '+r.error.message);return}await loadCloudBank();
}

function runTests(){
  if(!window.buildSimulationState||!window.pcSetState)return[];
  const original=state(),test=window.buildSimulationState();test.hourBankAgreements=[{id:'t-a',employeeId:'e1',validFrom:'2026-08-01',validTo:null,writtenAgreementConfirmed:true,note:''}];test.hourBankCompensations=[];
  window.pcSetState(test);const e=test.employees[0],out=[],check=(name,a,b)=>out.push({name,ok:a===b,a,b});
  try{
    let a=monthSummary(e,'2026-08');check('Agosto extras',Math.round(a.extra),2520);check('Agosto a pagar',Math.round(a.payable),2400);check('Agosto crédito',Math.round(a.credit),120);check('Agosto saldo',Math.round(a.balance),120);
    let s=monthSummary(e,'2026-09');check('Horas a menos não viram débito',Math.round(s.balance),120);
    test.hourBankCompensations.push({id:'t-s',employeeId:'e1',date:'2026-09-03',kind:'same_month',minutes:30,reason:'Redução de jornada',note:'',status:'Ativo'});check('Compensação do mês reduz a pagar',Math.round(monthSummary(e,'2026-09').payable),75);
    test.hourBankCompensations.push({id:'t-b',employeeId:'e1',date:'2026-09-03',kind:'bank_credit',minutes:30,reason:'Redução de jornada',note:'',status:'Ativo'});check('Uso do banco reduz saldo',Math.round(monthSummary(e,'2026-09').balance),90);
  }finally{window.pcSetState(original)}
  return out;
}
function runTestsHtml(){const r=runTests(),ok=r.filter(x=>x.ok).length;return '<b>'+ok+'/'+r.length+' aprovados</b>'+(ok===r.length?'':'<br>'+r.filter(x=>!x.ok).map(x=>x.name+': esperado '+x.b+', obtido '+x.a).join('<br>'))}

injectUI();ensureSimulationBank();renderBank();
setTimeout(loadCloudBank,500);setTimeout(loadCloudBank,1800);
if(window.pontoCasaSupabase)window.pontoCasaSupabase.auth.onAuthStateChange(()=>setTimeout(loadCloudBank,300));
document.addEventListener('click',()=>setTimeout(renderBank,0));
document.addEventListener('change',()=>setTimeout(renderBank,0));
})();