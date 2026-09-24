(function(){
const SUPABASE_URL='https://jkjgkdltivasjbrssmsf.supabase.co';
const SUPABASE_KEY='sb_publishable_M3kbYIqn9hfMDbH4UwIGwQ_ICyKKZu8';
const VERSION='0.10.1';

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

const accessGate=document.createElement('div');
accessGate.id='accessGate';
css(accessGate,{position:'fixed',inset:'0',background:'#f6f7f8',zIndex:'90',padding:'24px',display:'flex',alignItems:'center',justifyContent:'center'});
accessGate.innerHTML=`
<div style="max-width:420px;width:100%;background:white;border:1px solid #e5e7eb;border-radius:16px;padding:18px;text-align:center">
  <div style="font-size:22px;font-weight:800">PontoCasa</div>
  <div id="accessGateText" class="small muted" style="margin-top:8px">Verificando acesso...</div>
  <button id="accessGateLogin" class="primary hidden" style="margin-top:14px">Entrar</button>
</div>`;
document.body.appendChild(accessGate);

function gate(text,showLogin=false){
  const t=document.getElementById('accessGateText');
  if(t)t.textContent=text;
  const b=document.getElementById('accessGateLogin');
  if(b)b.classList.toggle('hidden',!showLogin);
  accessGate.classList.remove('hidden');
}
function openApp(){
  accessGate.classList.add('hidden');
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
css(overlay,{position:'fixed',inset:'0',background:'#0009',zIndex:'110',padding:'18px',overflow:'auto'});
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
document.getElementById('accessGateLogin').onclick=()=>{accessGate.classList.add('hidden');overlay.classList.remove('hidden')};
document.getElementById('cloudClose').onclick=async()=>{
  overlay.classList.add('hidden');
  const {data:{session}}=await sb.auth.getSession();
  if(!session) gate('Entre com sua conta para acessar o PontoCasa.',true);
};

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
    empButton.classList.add('hidden');
    employerButton.classList.remove('hidden');
    if(typeof role==='function') role(false);
  }else{
    empButton.classList.add('hidden');
    employerButton.classList.add('hidden');
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
    gate('Entre com sua conta para acessar o PontoCasa.',true);
    return;
  }

  try{
    const membership=await getMembership();

    if(!membership){
      document.getElementById('cloudWho').innerHTML=`<b>${esc(session.user.email||'')}</b><br>Perfil ainda não vinculado`;
      document.getElementById('cloudEmployerTools').classList.add('hidden');
      setRoleUI(null);
      if(currentInviteToken()){
        msg('Conta autenticada. Finalizando ativação do convite...');
        gate('Finalizando ativação do convite...',false);
      }else{
        msg('Esta conta ainda não possui perfil no PontoCasa.');
        gate('Esta conta ainda não possui acesso a um grupo PontoCasa.',true);
      }
      return;
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
      openApp();
    }else if(currentRole==='owner' || currentRole==='admin'){
      await loadEmployerCloudData();
      msg('Conta de empregador conectada.');
      openApp();
    }else{
      gate('Perfil sem permissão de acesso.',false);
    }
  }catch(e){
    console.error(e);
    msg('Erro ao identificar o perfil: '+e.message);
    gate('Não foi possível validar seu acesso. Tente novamente.',true);
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
        start:d.start_time?String(d.start_time).slice(0,5):'',
        bs:d.break_start?String(d.break_start).slice(0,5):'',
        be:d.break_end?String(d.break_end).slice(0,5):'',
        end:d.end_time?String(d.end_time).slice(0,5):''
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
  if(navigator.onLine) await syncOfflineQueue(false);
  await loadPunchesForCurrentEmployee();
  await loadCorrectionsForCurrentEmployee();
}


const OFFLINE_DB='pontocasa-offline-v1';
const OFFLINE_STORE='pending_punches';

function openOfflineDb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(OFFLINE_DB,1);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(OFFLINE_STORE)) db.createObjectStore(OFFLINE_STORE,{keyPath:'id'});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
async function offlinePut(item){
  const db=await openOfflineDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(OFFLINE_STORE,'readwrite');
    tx.objectStore(OFFLINE_STORE).put(item);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
  });
}
async function offlineAll(){
  const db=await openOfflineDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(OFFLINE_STORE,'readonly');
    const req=tx.objectStore(OFFLINE_STORE).getAll();
    req.onsuccess=()=>resolve(req.result||[]);
    req.onerror=()=>reject(req.error);
  });
}
async function offlineDelete(id){
  const db=await openOfflineDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(OFFLINE_STORE,'readwrite');
    tx.objectStore(OFFLINE_STORE).delete(id);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
  });
}
async function queueOfflinePunch(){
  if(!photo){toast('Tire a foto obrigatória.');return}
  const employee=st.employees[0], w=employee.workplace, c=classify(loc,w);
  const punchId=crypto.randomUUID(), now=new Date();
  const ext=(photo.match(/^data:image\/(png|webp)/)||[])[1]||'jpeg';
  const path=`${householdId}/${currentEmployeeCloudId}/${punchId}.${ext==='jpeg'?'jpg':ext}`;
  const payload={
    id:punchId,household_id:householdId,employee_id:currentEmployeeCloudId,
    punch_type:document.getElementById('pType').value,device_time:now.toISOString(),
    latitude:loc?.lat??null,longitude:loc?.lon??null,accuracy_m:loc?.acc??null,
    distance_to_workplace_m:c.d,location_status:c.text,
    estimated_address:loc?.addressEstimate||'Endereço estimado indisponível',
    photo_path:path,installation_id:inst(),app_version:'0.10.1',
    platform:navigator.userAgent.slice(0,500),was_offline:true,
    offline_captured_at:now.toISOString()
  };
  await offlinePut({id:punchId,payload,photoDataUrl:photo,createdAt:now.toISOString()});
  st.punches.push({
    id:punchId,employeeId:'e1',type:payload.punch_type,deviceTime:payload.device_time,
    serverTime:null,syncTime:null,lat:payload.latitude,lon:payload.longitude,
    accuracy:payload.accuracy_m,distance:payload.distance_to_workplace_m,status:payload.location_status,
    addressEstimate:payload.estimated_address,photo:photo,cloudPhotoPath:null,
    installationId:payload.installation_id,offline:true,pendingSync:true,
    integrityId:'Aguardando sincronização'
  });
  save();
  photo=null;loc=null;
  document.getElementById('camera').value='';
  document.getElementById('preview').style.display='none';
  document.getElementById('geoText').textContent='Ainda não capturada.';
  const banner=document.getElementById('syncBanner');
  if(banner){banner.textContent='Ponto salvo offline. Aguardando internet para sincronizar.';banner.classList.remove('hidden')}
  toast('Ponto salvo offline. Será sincronizado quando a internet voltar.');
  show('empHome',document.querySelector('#empNav [data-go="empHome"]'));
}
async function syncOfflineQueue(showMessage=true){
  if(!navigator.onLine || currentRole!=='employee' || !currentEmployeeCloudId)return 0;
  const items=(await offlineAll()).filter(x=>x.payload?.employee_id===currentEmployeeCloudId);
  if(!items.length)return 0;
  let synced=0;
  for(const item of items){
    try{
      const blob=dataUrlToBlob(item.photoDataUrl);
      const {error:upErr}=await sb.storage.from('punch-photos').upload(item.payload.photo_path,blob,{contentType:blob.type||'image/jpeg',upsert:false});
      if(upErr && !String(upErr.message||'').toLowerCase().includes('exist'))throw upErr;

      const {data,error}=await sb.from('punches').insert(item.payload).select('*').single();
      if(error && !(String(error.code)==='23505'||String(error.message||'').toLowerCase().includes('duplicate')))throw error;

      await offlineDelete(item.id);
      synced++;
    }catch(e){console.error('Falha ao sincronizar ponto offline',item.id,e)}
  }
  if(synced){
    await loadPunchesForCurrentEmployee();
    const banner=document.getElementById('syncBanner');
    if(banner){banner.textContent=synced===1?'1 ponto offline sincronizado com sucesso.':synced+' pontos offline sincronizados com sucesso.';banner.classList.remove('hidden');setTimeout(()=>banner.classList.add('hidden'),8000)}
    if(showMessage)toast(synced===1?'1 ponto offline sincronizado.':synced+' pontos offline sincronizados.');
  }
  return synced;
}

function dataUrlToBlob(dataUrl){
  const parts=dataUrl.split(',');
  const mime=(parts[0].match(/data:([^;]+)/)||[])[1]||'image/jpeg';
  const bin=atob(parts[1]||'');
  const arr=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);
  return new Blob([arr],{type:mime});
}

function cloudPunchToLocal(p, localEmployeeId){
  return {
    id:p.id,
    employeeId:localEmployeeId,
    type:p.punch_type,
    deviceTime:p.device_time,
    serverTime:p.server_received_at,
    syncTime:p.sync_received_at,
    lat:p.latitude,
    lon:p.longitude,
    accuracy:p.accuracy_m,
    distance:p.distance_to_workplace_m,
    status:p.location_status,
    addressEstimate:p.estimated_address||'Endereço estimado indisponível',
    photo:p.photo_path?'cloud':null,
    cloudPhotoPath:p.photo_path||null,
    installationId:p.installation_id,
    offline:!!p.was_offline,
    integrityId:p.evidence_hash||p.id
  };
}

async function loadPunchesForCurrentEmployee(){
  if(!currentEmployeeCloudId) return;
  const {data,error}=await sb.from('punches')
    .select('*')
    .eq('employee_id',currentEmployeeCloudId)
    .order('device_time',{ascending:true});
  if(error) throw error;
  st.punches=(data||[]).map(p=>cloudPunchToLocal(p,'e1'));
  save();
  render();
}

async function loadEmployerCloudData(){
  await ensureHousehold();
  const {data:employees,error}=await sb.from('employees')
    .select('*')
    .eq('household_id',householdId)
    .eq('active',true)
    .order('created_at');
  if(error) throw error;

  const loaded=[];
  for(let i=0;i<(employees||[]).length;i++){
    loaded.push(await cloudEmployeeToLocal(employees[i],i));
  }
  if(loaded.length) st.employees=loaded;

  const {data:punchRows,error:pErr}=await sb.from('punches')
    .select('*')
    .eq('household_id',householdId)
    .order('device_time',{ascending:true});
  if(pErr) throw pErr;

  const byCloud=new Map(st.employees.map(e=>[e.cloudId,e.id]));
  st.punches=(punchRows||[]).map(p=>cloudPunchToLocal(p,byCloud.get(p.employee_id)||p.employee_id));
  save();
  render();
  await loadEmployerCorrections();
}

async function saveCloudPunch(){
  if(!currentSession || currentRole!=='employee' || !currentEmployeeCloudId){
    toast('Entre com a conta do empregado.');
    return;
  }
  if(!navigator.onLine){
    await queueOfflinePunch();
    return;
  }
  if(!photo){toast('Tire a foto obrigatória.');return}

  const recent=st.punches.filter(x=>x.employeeId==='e1').sort((a,b)=>b.deviceTime.localeCompare(a.deviceTime))[0];
  if(recent && Date.now()-new Date(recent.deviceTime).getTime()<120000 && !confirm('Você acabou de registrar um ponto. Registrar outro?')) return;

  const btn=document.getElementById('savePunch');
  btn.disabled=true;
  const oldText=btn.textContent;
  btn.textContent='Registrando...';

  try{
    const employee=st.employees[0];
    const w=employee.workplace;
    const c=classify(loc,w);
    const punchId=crypto.randomUUID();
    const now=new Date();
    const ext=(photo.match(/^data:image\/(png|webp)/)||[])[1]||'jpeg';
    const path=`${householdId}/${currentEmployeeCloudId}/${punchId}.${ext==='jpeg'?'jpg':ext}`;
    const blob=dataUrlToBlob(photo);

    const {error:upErr}=await sb.storage.from('punch-photos').upload(path,blob,{
      contentType:blob.type||'image/jpeg',
      upsert:false
    });
    if(upErr) throw upErr;

    const payload={
      id:punchId,
      household_id:householdId,
      employee_id:currentEmployeeCloudId,
      punch_type:document.getElementById('pType').value,
      device_time:now.toISOString(),
      latitude:loc?.lat??null,
      longitude:loc?.lon??null,
      accuracy_m:loc?.acc??null,
      distance_to_workplace_m:c.d,
      location_status:c.text,
      estimated_address:loc?.addressEstimate||'Endereço estimado indisponível',
      photo_path:path,
      installation_id:inst(),
      app_version:'0.10.1',
      platform:navigator.userAgent.slice(0,500),
      was_offline:false
    };

    const {data,error}=await sb.from('punches').insert(payload).select('*').single();
    if(error) throw error;

    st.punches.push(cloudPunchToLocal(data,'e1'));
    save();

    photo=null; loc=null;
    document.getElementById('camera').value='';
    document.getElementById('preview').style.display='none';
    document.getElementById('geoText').textContent='Ainda não capturada.';
    toast('Ponto registrado na nuvem');
    show('empHome',document.querySelector('#empNav [data-go="empHome"]'));
  }catch(e){
    console.error(e);
    alert('Não foi possível registrar o ponto: '+e.message);
  }finally{
    btn.disabled=false;
    btn.textContent=oldText;
  }
}

const originalShowPhoto=window.showPhoto;
window.showPhoto=async function(id){
  const p=st.punches.find(x=>x.id===id);
  if(p?.cloudPhotoPath){
    try{
      const {data,error}=await sb.storage.from('punch-photos').createSignedUrl(p.cloudPhotoPath,60);
      if(error) throw error;
      document.getElementById('modalPhoto').src=data.signedUrl;
      document.getElementById('photoModal').classList.remove('hidden');
      return;
    }catch(e){
      alert('Não foi possível abrir a foto: '+e.message);
      return;
    }
  }
  if(originalShowPhoto) return originalShowPhoto(id);
};

document.getElementById('savePunch').onclick=saveCloudPunch;


function correctionToLocal(a,localEmployeeId){
  return {
    id:a.id,employeeId:localEmployeeId,type:a.requested_type,
    time:new Date(a.requested_time).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),
    requestedTime:a.requested_time,reason:a.reason,note:a.note||'',
    originalPunchId:a.original_punch_id||null,
    status:a.status,createdAt:a.requested_at,decidedAt:a.decided_at||null
  };
}
async function loadCorrectionsForCurrentEmployee(){
  if(!currentEmployeeCloudId)return;
  const {data,error}=await sb.from('correction_requests').select('*')
    .eq('employee_id',currentEmployeeCloudId).order('requested_at',{ascending:false});
  if(error)throw error;
  st.adjustments=(data||[]).map(a=>correctionToLocal(a,'e1'));
  save();render();
}
async function loadEmployerCorrections(){
  if(!(currentRole==='owner'||currentRole==='admin')||!householdId)return;
  const {data,error}=await sb.from('correction_requests').select('*')
    .eq('household_id',householdId).order('requested_at',{ascending:false});
  if(error)throw error;
  const byCloud=new Map(st.employees.map(e=>[e.cloudId,e.id]));
  st.adjustments=(data||[]).map(a=>correctionToLocal(a,byCloud.get(a.employee_id)||a.employee_id));
  save();render();
}
window.pcCorrectionPunchId=null;
window.pcOpenCorrection=function(punchId){
  const form=document.getElementById('adjustmentForm');
  const original=document.getElementById('adjustmentOriginal');
  window.pcCorrectionPunchId=punchId||null;
  if(punchId){
    const p=st.punches.find(x=>x.id===punchId);
    if(!p)return;
    const already=st.adjustments.find(a=>a.originalPunchId===punchId&&a.status==='Pendente');
    if(already){toast('Já existe uma correção pendente para esta batida.');return}
    document.getElementById('aType').value=p.type;
    const d=new Date(p.deviceTime);
    document.getElementById('aDate').value=d.toLocaleDateString('en-CA');
    document.getElementById('aTime').value=d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    document.getElementById('aReason').value='Horário incorreto';
    original.textContent='Batida original: '+p.type+' · '+d.toLocaleDateString('pt-BR')+' · '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    original.classList.remove('hidden');
  }else{
    document.getElementById('aDate').value=new Date().toLocaleDateString('en-CA');
    document.getElementById('aReason').value='Esqueci de registrar';
    original.classList.add('hidden');
  }
  form.classList.remove('hidden');
  show('empAdj',document.querySelector('#empNav [data-go="empAdj"]'));
};
window.pcSendAdjustment=async function(){
  if(currentRole!=='employee'||!currentEmployeeCloudId){toast('Entre como empregado.');return}
  if(!navigator.onLine){toast('Solicitações de ajuste precisam de internet nesta versão.');return}
  const date=document.getElementById('aDate')?.value||new Date().toISOString().slice(0,10);
  const time=document.getElementById('aTime').value;
  const requested=new Date(date+'T'+time+':00');
  if(Number.isNaN(requested.getTime())){toast('Informe data e horário válidos.');return}
  try{
    const {error}=await sb.from('correction_requests').insert({
      household_id:householdId,employee_id:currentEmployeeCloudId,
      original_punch_id:window.pcCorrectionPunchId||null,
      requested_type:document.getElementById('aType').value,
      requested_time:requested.toISOString(),
      reason:document.getElementById('aReason').value,
      note:document.getElementById('aNote').value||null
    });
    if(error)throw error;
    document.getElementById('aNote').value='';
    document.getElementById('adjustmentForm').classList.add('hidden');
    window.pcCorrectionPunchId=null;
    await loadCorrectionsForCurrentEmployee();
    toast('Solicitação enviada');
  }catch(e){console.error(e);alert('Não foi possível enviar a solicitação: '+e.message)}
};
window.pcDecideAdjustment=async function(id,status){
  if(!(currentRole==='owner'||currentRole==='admin')){toast('Ação não autorizada.');return}
  if(!navigator.onLine){toast('Conecte-se à internet para decidir a solicitação.');return}
  try{
    const {error}=await sb.from('correction_requests').update({
      status,decided_at:new Date().toISOString(),decided_by_user_id:currentSession.user.id
    }).eq('id',id);
    if(error)throw error;
    await loadEmployerCorrections();
    toast(status);
  }catch(e){console.error(e);alert('Não foi possível atualizar a solicitação: '+e.message)}
};

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

sb.auth.onAuthStateChange(async()=>{
  if(currentInviteToken()){
    gate('Finalizando ativação do convite...',false);
    return;
  }
  await refreshAuth();
});
window.addEventListener('online',async()=>{
  try{
    if(currentRole==='employee')await syncOfflineQueue(true);
    else if(currentRole==='owner'||currentRole==='admin')await loadEmployerCloudData();
  }catch(e){console.error(e)}
});
gate('Verificando acesso...',false);
refreshAuth();
bootInvite();
})();