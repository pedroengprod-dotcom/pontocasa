(function(){
const SUPABASE_URL='https://jkjgkdltivasjbrssmsf.supabase.co';
const SUPABASE_KEY='sb_publishable_M3kbYIqn9hfMDbH4UwIGwQ_ICyKKZu8';

if(!window.supabase){
  console.error('Supabase não carregou.');
  return;
}

const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
window.pontoCasaSupabase=sb;
let householdId=null;

function css(el,styles){Object.assign(el.style,styles)}
function msg(t){const x=document.getElementById('cloudStatus');if(x)x.textContent=t}
function makeBtn(t){const b=document.createElement('button');b.textContent=t;b.className='secondary';return b}

const account=makeBtn('Conta');
account.id='cloudAccountBtn';
account.style.width='auto';
account.style.minHeight='36px';
const top=document.querySelector('.top');
if(top) top.appendChild(account);

const overlay=document.createElement('div');
overlay.id='cloudPanel';
overlay.className='hidden';
css(overlay,{position:'fixed',inset:'0',background:'#0009',zIndex:'80',padding:'18px',overflow:'auto'});
overlay.innerHTML=`
<div style="max-width:520px;margin:24px auto;background:white;border-radius:16px;padding:16px">
  <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
    <div>
      <b style="font-size:20px">Conta PontoCasa</b>
      <div class="small muted">Fase 2A · dados do empregador na nuvem</div>
    </div>
    <button id="cloudClose" class="secondary" style="width:auto">Fechar</button>
  </div>

  <div id="cloudAuthBox" style="margin-top:14px">
    <label>E-mail</label>
    <input id="cloudEmail" type="email" autocomplete="email">
    <label>Senha</label>
    <input id="cloudPassword" type="password" autocomplete="current-password">
    <div class="grid2" style="margin-top:10px">
      <button id="cloudLogin" class="primary">Entrar</button>
      <button id="cloudSignup" class="secondary">Criar conta</button>
    </div>
  </div>

  <div id="cloudLoggedBox" class="hidden" style="margin-top:14px">
    <div class="note">
      <b>Sincronização do MVP</b><br>
      Empregados, jornadas e locais de trabalho são salvos no Supabase.
      As batidas ainda permanecem locais nesta etapa.
    </div>
    <button id="cloudUpload" class="primary" style="margin-top:10px">Enviar dados deste aparelho para a nuvem</button>
    <button id="cloudDownload" class="secondary" style="margin-top:8px">Baixar dados da nuvem</button>
    <button id="cloudLogout" class="secondary" style="margin-top:8px">Sair da conta</button>
  </div>

  <div id="cloudStatus" class="small muted" style="margin-top:12px">Verificando sessão...</div>
</div>`;
document.body.appendChild(overlay);

account.onclick=()=>overlay.classList.remove('hidden');
document.getElementById('cloudClose').onclick=()=>overlay.classList.add('hidden');

async function ensureHousehold(){
  const {data,error}=await sb.from('households').select('id,name').limit(1);
  if(error) throw error;
  if(data && data.length){
    householdId=data[0].id;
    return householdId;
  }
  const {data:hid,error:rpcErr}=await sb.rpc('create_household_for_current_user',{household_name:'Minha família'});
  if(rpcErr) throw rpcErr;
  householdId=hid;
  return hid;
}

async function refreshAuth(){
  const {data:{session}}=await sb.auth.getSession();
  const logged=!!session;
  document.getElementById('cloudAuthBox').classList.toggle('hidden',logged);
  document.getElementById('cloudLoggedBox').classList.toggle('hidden',!logged);

  if(logged){
    try{
      await ensureHousehold();
      msg('Conectado como '+session.user.email);
    }catch(e){
      msg('Conectado, mas houve erro ao abrir o grupo: '+e.message);
    }
  }else{
    msg('Entre ou crie a conta do empregador.');
  }
}

document.getElementById('cloudSignup').onclick=async()=>{
  const email=document.getElementById('cloudEmail').value.trim();
  const password=document.getElementById('cloudPassword').value;
  if(!email || password.length<6){
    msg('Informe e-mail e uma senha com pelo menos 6 caracteres.');
    return;
  }
  msg('Criando conta...');
  const {data,error}=await sb.auth.signUp({email,password});
  if(error){msg(error.message);return}
  if(data.session){
    await ensureHousehold();
    msg('Conta criada e conectada.');
    await refreshAuth();
  }else{
    msg('Conta criada. Se o Supabase pedir confirmação, verifique seu e-mail.');
  }
};

document.getElementById('cloudLogin').onclick=async()=>{
  const email=document.getElementById('cloudEmail').value.trim();
  const password=document.getElementById('cloudPassword').value;
  msg('Entrando...');
  const {error}=await sb.auth.signInWithPassword({email,password});
  if(error){msg(error.message);return}
  await refreshAuth();
};

document.getElementById('cloudLogout').onclick=async()=>{
  await sb.auth.signOut();
  householdId=null;
  await refreshAuth();
};

function schedRows(e,scheduleId){
  return Object.keys(e.schedule||{}).map(k=>{
    const d=e.schedule[k];
    return {
      schedule_id:scheduleId,
      weekday:Number(k),
      works:!!d.works,
      start_time:d.start||null,
      break_start:d.bs||null,
      break_end:d.be||null,
      end_time:d.end||null
    };
  });
}

async function syncEmployee(e){
  const payload={
    household_id:householdId,
    full_name:e.name,
    cpf:e.cpf,
    pis:e.pis||null,
    contact:e.contact||null,
    admission_date:e.admission||null,
    job_title:e.role||null,
    active:e.active!==false
  };

  let cloudId=e.cloudId;

  if(cloudId){
    const {error}=await sb.from('employees').update(payload).eq('id',cloudId);
    if(error) throw error;
  }else{
    const {data,error}=await sb.from('employees').insert(payload).select('id').single();
    if(error) throw error;
    cloudId=data.id;
    e.cloudId=cloudId;
  }

  let {data:schedules,error:sErr}=await sb
    .from('schedules')
    .select('id')
    .eq('employee_id',cloudId)
    .order('created_at',{ascending:false})
    .limit(1);

  if(sErr) throw sErr;

  let scheduleId=schedules && schedules[0]?.id;

  if(!scheduleId){
    const {data,error}=await sb.from('schedules')
      .insert({
        household_id:householdId,
        employee_id:cloudId,
        valid_from:new Date().toISOString().slice(0,10)
      })
      .select('id')
      .single();

    if(error) throw error;
    scheduleId=data.id;
  }

  const {error:daysErr}=await sb.from('schedule_days')
    .upsert(schedRows(e,scheduleId),{onConflict:'schedule_id,weekday'});
  if(daysErr) throw daysErr;

  const {data:wps,error:wErr}=await sb.from('workplaces')
    .select('id')
    .eq('employee_id',cloudId)
    .eq('active',true)
    .limit(1);

  if(wErr) throw wErr;

  const w=e.workplace||{};
  const wpPayload={
    household_id:householdId,
    employee_id:cloudId,
    name:w.name||'Casa principal',
    address_text:w.address||null,
    latitude:w.lat??null,
    longitude:w.lon??null,
    radius_m:Number(w.radius||100),
    active:true
  };

  if(wps && wps[0]){
    const {error}=await sb.from('workplaces').update(wpPayload).eq('id',wps[0].id);
    if(error) throw error;
  }else{
    const {error}=await sb.from('workplaces').insert(wpPayload);
    if(error) throw error;
  }
}

document.getElementById('cloudUpload').onclick=async()=>{
  try{
    msg('Enviando dados...');
    await ensureHousehold();
    for(const e of st.employees) await syncEmployee(e);
    save();
    msg('Sincronização concluída. Empregados, jornadas e locais estão no Supabase.');
  }catch(e){
    console.error(e);
    msg('Erro na sincronização: '+e.message);
  }
};

document.getElementById('cloudDownload').onclick=async()=>{
  try{
    msg('Baixando dados...');
    await ensureHousehold();

    const {data:employees,error}=await sb.from('employees')
      .select('*')
      .eq('household_id',householdId)
      .eq('active',true)
      .order('created_at');

    if(error) throw error;

    const loaded=[];

    for(let i=0;i<employees.length;i++){
      const ce=employees[i];

      const {data:ss,error:se}=await sb.from('schedules')
        .select('id')
        .eq('employee_id',ce.id)
        .order('created_at',{ascending:false})
        .limit(1);

      if(se) throw se;

      let schedule=JSON.parse(JSON.stringify(baseSched));

      if(ss && ss[0]){
        const {data:days,error:de}=await sb.from('schedule_days')
          .select('*')
          .eq('schedule_id',ss[0].id);

        if(de) throw de;

        schedule={};
        for(const d of days){
          schedule[d.weekday]={
            works:d.works,
            start:d.start_time||'',
            bs:d.break_start||'',
            be:d.break_end||'',
            end:d.end_time||''
          };
        }
      }

      const {data:wps,error:we}=await sb.from('workplaces')
        .select('*')
        .eq('employee_id',ce.id)
        .eq('active',true)
        .limit(1);

      if(we) throw we;

      const w=wps && wps[0];

      loaded.push({
        id:i===0?'e1':ce.id,
        cloudId:ce.id,
        name:ce.full_name,
        cpf:ce.cpf,
        pis:ce.pis||'',
        contact:ce.contact||'',
        admission:ce.admission_date||'',
        role:ce.job_title||'',
        active:ce.active,
        schedule,
        workplace:{
          name:w?.name||'Casa principal',
          address:w?.address_text||'',
          lat:w?.latitude??null,
          lon:w?.longitude??null,
          radius:w?.radius_m||100
        }
      });
    }

    if(loaded.length){
      st.employees=loaded;
      save();
      render();
      msg('Dados da nuvem carregados neste aparelho.');
    }else{
      msg('Ainda não há empregados na nuvem.');
    }
  }catch(e){
    console.error(e);
    msg('Erro ao baixar: '+e.message);
  }
};

sb.auth.onAuthStateChange(()=>refreshAuth());
refreshAuth();
})();