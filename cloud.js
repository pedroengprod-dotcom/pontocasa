(function(){
const SUPABASE_URL='https://jkjgkdltivasjbrssmsf.supabase.co';
const SUPABASE_KEY='sb_publishable_M3kbYIqn9hfMDbH4UwIGwQ_ICyKKZu8';
const VERSION='0.7';

if(!window.supabase){
  console.error('Supabase não carregou.');
  return;
}

const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
window.pontoCasaSupabase=sb;

let householdId=null;
let currentSession=null;
let currentRole=null;
let currentEmployeeCloudId=null;

function css(el,styles){Object.assign(el.style,styles)}
function msg(t){const x=document.getElementById('cloudStatus');if(x)x.textContent=t}
function makeBtn(t, cls='secondary'){
  const b=document.createElement('button');
  b.textContent=t;
  b.className=cls;
  return b;
}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function appBaseUrl(){
  return window.location.origin + window.location.pathname.replace(/\/[^/]*$/,'/');
}

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
      <div class="small muted">v${VERSION} · login e convite de empregado</div>
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
    <div class="note" id="cloudWho"></div>
    <div id="cloudEmployerTools">
      <button id="cloudUpload" class="primary" style="margin-top:10px">Enviar dados deste aparelho para a nuvem</button>
      <button id="cloudDownload" class="secondary" style="margin-top:8px">Baixar dados da nuvem</button>
    </div>
    <button id="cloudLogout" class="secondary" style="margin-top:8px">Sair da conta</button>
  </div>

  <div id="cloudStatus" class="small muted" style="margin-top:12px">Verificando sessão...</div>
</div>`;
document.body.appendChild(overlay);

account.onclick=()=>overlay.classList.remove('hidden');
document.getElementById('cloudClose').onclick=()=>overlay.classList.add('hidden');

const activation=document.createElement('div');
activation.id='invitePanel';
activation.className='hidden';
css(activation,{position:'fixed',inset:'0',background:'#f6f7f8',zIndex:'95',padding:'18px',overflow:'auto'});
activation.innerHTML=`
<div style="max-width:520px;margin:24px auto;background:white;border:1px solid #e5e7eb;border-radius:16px;padding:18px">
  <div style="font-size:22px;font-weight:800">Ativar acesso ao PontoCasa</div>
  <div class="small muted" style="margin-top:5px">Você recebeu um convite do seu empregador.</div>
  <div class="note" style="margin-top:14px">Crie sua conta usando seu próprio e-mail. O convite só pode ser usado uma vez.</div>
  <label>E-mail</label><input id="inviteEmail" type="email" autocomplete="email">
  <label>Senha</label><input id="invitePassword" type="password" autocomplete="new-password">
  <button id="inviteActivate" class="primary" style="margin-top:12px">Criar conta e ativar</button>
  <button id="inviteExisting" class="secondary" style="margin-top:8px">Já tenho conta</button>
  <div id="inviteExistingBox" class="hidden">
    <label>Senha da conta</label><input id="inviteExistingPassword" type="password" autocomplete="current-password">
    <button id="inviteLoginActivate" class="primary" style="margin-top:8px">Entrar e ativar convite</button>
  </div>
  <div id="inviteStatus" class="small muted" style="margin-top:12px"></div>
</div>`;
document.body.appendChild(activation);

function inviteMsg(t){document.getElementById('inviteStatus').textContent=t}

async function getMembership(){
  const {data:{session}}=await sb.auth.getSession();
  currentSession=session;
  if(!session){ currentRole=null; currentEmployeeCloudId=null; return null; }

  const {data:members,error}=await sb
    .from('household_members')
    .select('household_id,role')
    .eq('user_id',session.user.id)
    .limit(1);

  if(error) throw error;
  if(!members || !members.length){ currentRole=null; return null; }

  currentRole=members[0].role;
  householdId=members[0].household_id;

  if(currentRole==='employee'){
    const {data:e,error:ee}=await sb
      .from('employees')
      .select('id')
      .eq('auth_user_id',session.user.id)
      .limit(1);
    if(ee) throw ee;
    currentEmployeeCloudId=e?.[0]?.id || null;
  }
  return members[0];
}

async function ensureHousehold(){
  if(householdId) return householdId;
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

function setRoleUI(roleName){
  const empButton=document.getElementById('rEmp');
  const employerButton=document.getElementById('rEr');

  if(roleName==='employee'){
    employerButton.classList.add('hidden');
    empButton.classList.remove('hidden');
    if(typeof role==='function') role(true);
  }else if(roleName==='owner' || roleName==='admin'){
    employerButton.classList.remove('hidden');
    empButton.classList.remove('hidden');
    if(typeof role==='function') role(false);
  }else{
    employerButton.classList.remove('hidden');
    empButton.classList.remove('hidden');
  }
}

async function refreshAuth(){
  const {data:{session}}=await sb.auth.getSession();
  currentSession=session;
  const logged=!!session;
  document.getElementById('cloudAuthBox').classList.toggle('hidden',logged);
  document.getElementById('cloudLoggedBox').classList.toggle('hidden',!logged);

  if(!logged){
    msg('Entre ou crie uma conta.');
    document.getElementById('cloudWho').textContent='';
    setRoleUI(null);
    return;
  }

  try{
    let membership=await getMembership();

    if(!membership){
      // A newly-created employer has no membership yet; create the household.
      await ensureHousehold();
      membership=await getMembership();
    }

    const email=session.user.email || '';
    const roleLabel=currentRole==='owner'?'Proprietário':
      currentRole==='admin'?'Administrador':
      currentRole==='employee'?'Empregado':'Usuário';

    document.getElementById('cloudWho').innerHTML=
      `<b>${esc(email)}</b><br>Perfil: ${esc(roleLabel)}`;

    document.getElementById('cloudEmployerTools').classList.toggle(
      'hidden',
      !(currentRole==='owner' || currentRole==='admin')
    );

    setRoleUI(currentRole);

    if(currentRole==='employee'){
      await loadEmployeeForCurrentUser();
      msg('Conta de empregado conectada.');
    }else{
      msg('Conta conectada.');
    }
  }catch(e){
    console.error(e);
    msg('Erro ao identificar o perfil: '+e.message);
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
    await refreshAuth();
    msg('Conta criada e conectada.');
  }else{
    msg('Conta criada. Verifique seu e-mail se a confirmação estiver habilitada.');
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
  currentRole=null;
  currentEmployeeCloudId=null;
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
    .from('schedules').select('id')
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
      .select('id').single();

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
    if(editing) addInviteButton();
  }catch(e){
    console.error(e);
    msg('Erro na sincronização: '+e.message);
  }
};

async function cloudEmployeeToLocal(ce, index=0){
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

  return {
    id:index===0?'e1':ce.id,
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
  };
}

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
      loaded.push(await cloudEmployeeToLocal(employees[i], i));
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

async function loadEmployeeForCurrentUser(){
  const {data:rows,error}=await sb.from('employees')
    .select('*')
    .eq('auth_user_id',currentSession.user.id)
    .limit(1);
  if(error) throw error;
  if(!rows || !rows.length) throw new Error('Cadastro do empregado não encontrado.');

  const local=await cloudEmployeeToLocal(rows[0],0);
  st.employees=[local];
  save();

  const greeting=document.querySelector('#empHome .title');
  if(greeting) greeting.textContent='Olá, '+local.name.split(' ')[0];

  render();
}

async function generateInviteForEmployee(localEmployee){
  if(!currentSession) throw new Error('Entre na conta do empregador primeiro.');
  if(!(currentRole==='owner'||currentRole==='admin')) throw new Error('Somente empregador/administrador pode convidar.');
  if(!localEmployee.cloudId) throw new Error('Sincronize os dados com a nuvem antes de gerar o convite.');

  const {data:token,error}=await sb.rpc('create_employee_invite',{
    target_employee_id:localEmployee.cloudId
  });
  if(error) throw error;

  const url=appBaseUrl()+'?invite='+encodeURIComponent(token);
  return url;
}

async function shareInvite(url, employeeName){
  const text=`Olá! Este é seu convite para ativar o acesso ao PontoCasa: ${url}`;
  if(navigator.share){
    try{
      await navigator.share({title:'Convite PontoCasa',text,url});
      return 'Convite compartilhado.';
    }catch(e){
      if(e.name==='AbortError') return 'Compartilhamento cancelado.';
    }
  }
  try{
    await navigator.clipboard.writeText(text);
    return 'Link copiado. Cole no WhatsApp.';
  }catch(e){
    prompt('Copie este link e envie pelo WhatsApp:',url);
    return 'Link gerado.';
  }
}

function addInviteButton(){
  const editor=document.getElementById('editor');
  if(!editor || editor.classList.contains('hidden')) return;

  let b=document.getElementById('inviteEmployeeBtn');
  if(!b){
    b=makeBtn('Convidar empregado por link');
    b.id='inviteEmployeeBtn';
    b.style.marginTop='10px';
    const close=document.getElementById('closeEditor');
    close.parentNode.insertBefore(b, close);
  }

  const e=editing?emp(editing):null;
  const allowed=e && e.cloudId && (currentRole==='owner'||currentRole==='admin');
  b.disabled=!allowed;
  b.textContent=allowed?'Convidar empregado por link':
    (!e?.cloudId?'Sincronize antes de convidar':'Convite indisponível');

  b.onclick=async()=>{
    try{
      b.disabled=true;
      b.textContent='Gerando convite...';
      const url=await generateInviteForEmployee(emp(editing));
      const result=await shareInvite(url,emp(editing).name);
      toast(result);
    }catch(e){
      console.error(e);
      toast('Erro ao gerar convite');
      alert(e.message);
    }finally{
      addInviteButton();
    }
  };
}

// Re-run invite button whenever the employee editor is opened.
const originalEditEmp=window.editEmp;
if(typeof originalEditEmp==='function'){
  window.editEmp=function(id){
    originalEditEmp(id);
    setTimeout(addInviteButton,0);
  };
}
// Existing event handlers reference the original function by identifier, so watch the editor visibility too.
const observer=new MutationObserver(()=>addInviteButton());
const editorNode=document.getElementById('editor');
if(editorNode) observer.observe(editorNode,{attributes:true,attributeFilter:['class']});

function currentInviteToken(){
  return new URLSearchParams(window.location.search).get('invite');
}

async function activateInviteAfterAuth(token){
  inviteMsg('Vinculando sua conta ao cadastro...');
  const {data,error}=await sb.rpc('activate_employee_invite',{raw_token:token});
  if(error) throw error;
  currentEmployeeCloudId=data;
  const clean=window.location.origin+window.location.pathname;
  history.replaceState({},'',clean);
  await refreshAuth();
  activation.classList.add('hidden');
  toast('Acesso ativado com sucesso');
}

async function inviteSignup(){
  const token=currentInviteToken();
  const email=document.getElementById('inviteEmail').value.trim();
  const password=document.getElementById('invitePassword').value;
  if(!token){inviteMsg('Convite não encontrado.');return}
  if(!email || password.length<6){inviteMsg('Informe e-mail e senha com pelo menos 6 caracteres.');return}

  inviteMsg('Criando conta...');
  const {data,error}=await sb.auth.signUp({email,password});
  if(error){inviteMsg(error.message);return}

  if(!data.session){
    inviteMsg('Conta criada, mas precisa de confirmação por e-mail antes da ativação.');
    return;
  }

  try{
    await activateInviteAfterAuth(token);
  }catch(e){
    inviteMsg(e.message);
  }
}

document.getElementById('inviteActivate').onclick=inviteSignup;
document.getElementById('inviteExisting').onclick=()=>{
  document.getElementById('inviteExistingBox').classList.toggle('hidden');
};
document.getElementById('inviteLoginActivate').onclick=async()=>{
  const token=currentInviteToken();
  const email=document.getElementById('inviteEmail').value.trim();
  const password=document.getElementById('inviteExistingPassword').value;
  if(!token){inviteMsg('Convite não encontrado.');return}
  if(!email || !password){inviteMsg('Informe e-mail e senha.');return}

  inviteMsg('Entrando...');
  const {error}=await sb.auth.signInWithPassword({email,password});
  if(error){inviteMsg(error.message);return}

  try{
    await activateInviteAfterAuth(token);
  }catch(e){
    inviteMsg(e.message);
  }
};

async function bootInvite(){
  const token=currentInviteToken();
  if(!token) return;
  activation.classList.remove('hidden');

  const {data:{session}}=await sb.auth.getSession();
  if(session){
    inviteMsg('Conta já conectada. Ativando convite...');
    try{
      await activateInviteAfterAuth(token);
    }catch(e){
      inviteMsg(e.message);
    }
  }else{
    inviteMsg('Crie sua conta para ativar o convite.');
  }
}

sb.auth.onAuthStateChange(()=>refreshAuth());
refreshAuth();
bootInvite();
})();