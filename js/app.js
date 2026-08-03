(() => {
  'use strict';
  const LEGACY_KEY='xcmg_report_v1';
  const AUTH_KEY='xcmg_report_auth_v1';
  const AUTH_BACKUP_KEY='xcmg_report_auth_backup_v1';
  const TURN_KEY='xcmg_report_last_turn_v1';
  const MAINT_HISTORY_KEY='xcmg_report_maintenance_history_v1';
  const USER_KEY=id=>`xcmg_report_user_${id}`;
  const SUPABASE_URL='https://dqslcjxetirfhcftaqjz.supabase.co';
  const SUPABASE_KEY='sb_publishable_hRARb5cN-tFqp0uJDpXFCA_ASKtJopY';
  const SUPABASE_TABLE='app_storage';
  const supabaseClient=window.supabase?.createClient(SUPABASE_URL,SUPABASE_KEY,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
  });
  let syncWarningShown=false;
  function showSyncWarning(error){
    console.error('Falha na sincronização com o Supabase:',error);
    if(!syncWarningShown){
      syncWarningShown=true;
      setTimeout(()=>toast('Não foi possível sincronizar com o Supabase. Verifique a tabela e as políticas. Dados mantidos neste aparelho.'),500);
    }
  }
  function connectionIsOnline(){return window.XCMGOfflineSync?.isOnline?.()===true}
  async function remoteGet(key){
    if(!connectionIsOnline())return null;
    if(!supabaseClient){showSyncWarning(new Error('Biblioteca do Supabase não carregada.'));return null}
    try{
      const {data,error}=await supabaseClient.from(SUPABASE_TABLE).select('value').eq('key',key).maybeSingle();
      if(error)throw error;
      return data?.value??null;
    }catch(error){if(navigator.onLine===false)await window.XCMGOfflineSync?.markOffline?.();else await window.XCMGOfflineSync?.markSyncError?.();showSyncWarning(error);return null}
  }
  async function directRemoteSet(key,value){
    if(!supabaseClient||!connectionIsOnline())return false;
    const {error}=await supabaseClient.from(SUPABASE_TABLE).upsert({key,value,updated_at:new Date().toISOString()},{onConflict:'key'});
    if(error)throw error;
    return true;
  }
  async function directRemoteDelete(key){
    if(!supabaseClient||!connectionIsOnline())return false;
    const {error}=await supabaseClient.from(SUPABASE_TABLE).delete().eq('key',key);
    if(error)throw error;
    return true;
  }
  async function remoteSet(key,value){
    if(!connectionIsOnline()||!supabaseClient){
      await window.XCMGOfflineSync?.enqueueSet(key,value);
      return true;
    }
    try{
      await directRemoteSet(key,value);
      await window.XCMGOfflineSync?.clearKey(key);
      syncWarningShown=false;
      window.XCMGOfflineSync?.emit();
      return true;
    }catch(error){
      if(navigator.onLine===false)await window.XCMGOfflineSync?.markOffline?.();else await window.XCMGOfflineSync?.markSyncError?.();
      await window.XCMGOfflineSync?.enqueueSet(key,value);
      showSyncWarning(error);
      return true;
    }
  }
  async function remoteDelete(key){
    if(!connectionIsOnline()||!supabaseClient){
      await window.XCMGOfflineSync?.enqueueDelete(key);
      return true;
    }
    try{
      await directRemoteDelete(key);
      await window.XCMGOfflineSync?.clearKey(key);
      window.XCMGOfflineSync?.emit();
      return true;
    }catch(error){
      if(navigator.onLine===false)await window.XCMGOfflineSync?.markOffline?.();else await window.XCMGOfflineSync?.markSyncError?.();
      await window.XCMGOfflineSync?.enqueueDelete(key);
      showSyncWarning(error);
      return true;
    }
  }
  async function flushOfflineQueue(){
    if(!window.XCMGOfflineSync||!connectionIsOnline()||!supabaseClient)return;
    window.XCMGOfflineSync.emit({syncing:true});
    const result=await window.XCMGOfflineSync.flush(async item=>{
      if(item.type==='delete')return directRemoteDelete(item.key);
      return directRemoteSet(item.key,item.value);
    });
    if(result.sent>0)toast(`${result.sent} alteração${result.sent>1?'ões':''} sincronizada${result.sent>1?'s':''} com sucesso`);
  }
  async function hydrateRemoteCache(){
    const pendingKeys=new Set(await window.XCMGOfflineSync?.pendingKeys?.()||[]);
    const keys=[AUTH_KEY,TURN_KEY,MAINT_HISTORY_KEY];
    for(const key of keys){
      if(pendingKeys.has(key))continue;
      const value=await remoteGet(key);
      if(value===null)continue;
      if(key===AUTH_KEY&&(!Array.isArray(value.users)||!value.users.length))continue;
      localStorage.setItem(key,JSON.stringify(value));
      if(key===AUTH_KEY)localStorage.setItem(AUTH_BACKUP_KEY,JSON.stringify(value));
    }
    let cachedAuth=null;try{cachedAuth=JSON.parse(localStorage.getItem(AUTH_KEY))}catch{}
    for(const user of cachedAuth?.users||[]){
      const key=USER_KEY(user.id);
      if(pendingKeys.has(key))continue;
      const value=await remoteGet(key);
      if(value!==null)localStorage.setItem(key,JSON.stringify(value));
    }
  }
  const CATEGORIES=[
    'Status dos Guindastes - Turno',
    'Status dos Guindastes - ADM',
    'Status das Carretas - Turno',
    'Status das Carretas - ADM',
    'Status dos Caminhões - Turno',
    'Status dos Caminhões - ADM',
    'GUINDAUTO SKY MUNCK',
    'STATUS EMPILHADEIRAS'
  ];
  const STATUSES=['Disponível','Em atendimento','Preventiva','Corretiva','Renovação do selo (Vale)'];
  function capacityNumber(value=''){
    const match=String(value).replace(',','.').match(/\d+(?:\.\d+)?/);
    return match?Number(match[0]):Number.POSITIVE_INFINITY;
  }
  function compareEquipments(a,b){
    const categoryA=CATEGORIES.indexOf(a.category),categoryB=CATEGORIES.indexOf(b.category);
    const orderA=categoryA===-1?CATEGORIES.length:categoryA;
    const orderB=categoryB===-1?CATEGORIES.length:categoryB;
    if(orderA!==orderB)return orderA-orderB;
    const capacityA=capacityNumber(a.capacity),capacityB=capacityNumber(b.capacity);
    if(capacityA!==capacityB)return capacityA-capacityB;
    return String(a.prefix||'').localeCompare(String(b.prefix||''),'pt-BR',{numeric:true,sensitivity:'base'});
  }
  const DEFAULT_EQUIPMENTS=[
    {prefix:'1JA268',capacity:''},
    {prefix:'1JA273',capacity:''},
    {prefix:'1JA339',capacity:''},
    {prefix:'1JA343',capacity:''},
    {prefix:'1JA347',capacity:''},
    {prefix:'1JA348',capacity:''},
    {prefix:'1JA378',capacity:''},
    {prefix:'1JA377',capacity:''},
    {prefix:'1JA360',capacity:''},
    {prefix:'1JA410',capacity:''},
    {prefix:'1JA537',capacity:''},
    {prefix:'1JA536',capacity:''},
    {prefix:'1JA342',capacity:''},
    {prefix:'1JA369',capacity:'16t'},
    {prefix:'1JA373',capacity:'16t'},
    {prefix:'1JA374',capacity:'7t'},
    {prefix:'1JA376',capacity:'10t'},
    {prefix:'1JA375',capacity:'10t'},
    {prefix:'1JA221',capacity:'110t'},
    {prefix:'1JA218',capacity:'250t'},
    {prefix:'1JA241',capacity:'250t'},
    {prefix:'1JA230',capacity:'70t'},
    {prefix:'1JA226',capacity:'110t'},
    {prefix:'1JA405',capacity:''},
    {prefix:'1JA406',capacity:''}
  ];
  const DEFAULT_CLIENTS={
    '1JA339':'POOL',
    '1JA343':'TRUCKLESS',
    '1JA347':'ESCAVAÇÃO',
    '1JA348':'POOL',
    '1JA378':'POOL',
    '1JA377':'VULCA',
    '1JA360':'ELÉTRICA',
    '1JA410':'PERFURAÇÃO',
    '1JA537':'SOTREQ',
    '1JA536':'POOL',
    '1JA342':'POOL',
    '1JA405':'POOL',
    '1JA406':'POOL'
  };
  const statusColor={
    'Disponível':'#16a34a',
    'Em atendimento':'#1d8cff',
    'Preventiva':'#ff5d6c',
    'Corretiva':'#ff5d6c',
    'Renovação do selo (Vale)':'#f4c430'
  };
  const statusEmoji={
    'Disponível':'🟢',
    'Em atendimento':'🔵',
    'Preventiva':'🔴',
    'Corretiva':'🔴',
    'Renovação do selo (Vale)':'🟡'
  };
  const legacyCategory={
    Guindaste:'Status dos Guindastes - Turno',
    Carreta:'Status das Carretas - Turno',
    Caminhão:'Status dos Caminhões - Turno',
    Munck:'GUINDAUTO SKY MUNCK',
    Empilhadeira:'STATUS EMPILHADEIRAS',
    Prancha:'Status das Carretas - Turno',
    Outro:'GUINDAUTO SKY MUNCK'
  };
  const legacyStatus={
    'Aguardando frente de serviço':'Disponível',
    Operacional:'Disponível',
    Patolado:'Em atendimento',
    Estacionado:'Disponível',
    Indisponível:'Corretiva',
    Manutenção:'Corretiva',
    Manutencao:'Corretiva'
  };
  const MESSAGE_TABLE='xcmg_messages';
  const MESSAGE_CACHE_KEY='xcmg_report_messages_v1';
  const initial={
    settings:{company:'XCMG',title:'STATUS XCMG MINA',fuelLimit:30,theme:'dark'},
    reportDefaults:{team:'',supervisor:'',programmer:'',safety:'',rigger:''},
    equipments:[],history:[],reports:[]
  };
  let state=clone(initial);
  window.XCMGEquipmentCatalog=()=>{
    const seen=new Set();
    return (state.equipments||[]).map(e=>{
      const label=equipmentLabel(e.prefix,e.capacity).trim();
      return {id:String(e.id||''),label,prefix:String(e.prefix||'').trim(),capacity:String(e.capacity||'').trim(),category:String(e.category||'').trim()};
    }).filter(e=>e.label&&!seen.has(e.label.toUpperCase())&&seen.add(e.label.toUpperCase()));
  };
  let maintenanceHistory=[];
  let messages=[];
  let messageTab='inbox';
  let auth={users:[],currentUserId:null};
  let currentUser=null;
  let autoTurnEnabled=false;
  let autoTurnTimer=null;
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  function isConsultation(){return currentUser?.role!=='admin'&&currentUser?.accessLevel==='consultation'}
  function canOperate(){return !isConsultation()}
  function denyConsultation(){if(isConsultation()){alert('Este usuário possui acesso somente para visualizar, copiar e compartilhar.');return true}return false}
  function clone(v){return JSON.parse(JSON.stringify(v))}
  function loadUserState(userId){
    try{
      let d=JSON.parse(localStorage.getItem(USER_KEY(userId)));
      if(!d && currentUser?.role==='admin') d=JSON.parse(localStorage.getItem(LEGACY_KEY));
      const base=d&&Array.isArray(d.equipments)?d:clone(initial);
      base.settings={...initial.settings,...(base.settings||{})};
      base.history=Array.isArray(base.history)?base.history:[];
      base.reports=Array.isArray(base.reports)?base.reports:[];
      const savedDefaults=base.reportDefaults||{};
      const isEdson=currentUser?.username==='edson'||currentUser?.name==='Edson Alves';
      base.reportDefaults={
        team:savedDefaults.team||currentUser?.team||'',
        supervisor:savedDefaults.supervisor||(isEdson?'Marcos Goulart':''),
        programmer:savedDefaults.programmer||currentUser?.name||'',
        safety:savedDefaults.safety||(isEdson?'Michele Silva':''),
        rigger:savedDefaults.rigger||(isEdson?'Wellington Junior':'')
      };
      base.equipments=base.equipments.map(migrateEquipment);
      return base;
    }catch{return clone(initial)}
  }
  function newId(){
    return globalThis.crypto?.randomUUID?.()||(`id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`);
  }
  function sha256Fallback(bytes){
    const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
    const bitLen=bytes.length*8;
    const withOne=bytes.length+1;
    const paddedLen=((withOne+8+63)>>6)<<6;
    const buf=new Uint8Array(paddedLen);
    buf.set(bytes);buf[bytes.length]=0x80;
    const view=new DataView(buf.buffer);
    view.setUint32(paddedLen-4,bitLen>>>0);
    const rr=(n,x)=>(x>>>n)|(x<<(32-n));
    for(let i=0;i<paddedLen;i+=64){
      const w=new Uint32Array(64);
      for(let j=0;j<16;j++)w[j]=view.getUint32(i+j*4);
      for(let j=16;j<64;j++){
        const s0=rr(7,w[j-15])^rr(18,w[j-15])^(w[j-15]>>>3);
        const s1=rr(17,w[j-2])^rr(19,w[j-2])^(w[j-2]>>>10);
        w[j]=(w[j-16]+s0+w[j-7]+s1)>>>0;
      }
      let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
      for(let j=0;j<64;j++){
        const S1=rr(6,e)^rr(11,e)^rr(25,e);
        const ch=(e&f)^((~e)&g);
        const t1=(h+S1+ch+K[j]+w[j])>>>0;
        const S0=rr(2,a)^rr(13,a)^rr(22,a);
        const maj=(a&b)^(a&c)^(b&c);
        const t2=(S0+maj)>>>0;
        h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
      }
      h0=(h0+a)>>>0;h1=(h1+b)>>>0;h2=(h2+c)>>>0;h3=(h3+d)>>>0;h4=(h4+e)>>>0;h5=(h5+f)>>>0;h6=(h6+g)>>>0;h7=(h7+h)>>>0;
    }
    return [h0,h1,h2,h3,h4,h5,h6,h7].map(v=>v.toString(16).padStart(8,'0')).join('');
  }
  async function hashPassword(value){
    const data=new TextEncoder().encode(String(value));
    if(globalThis.crypto?.subtle?.digest){
      try{
        const hash=await crypto.subtle.digest('SHA-256',data);
        return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
      }catch{}
    }
    return sha256Fallback(data);
  }
  async function loadAuth(){
    try{auth=JSON.parse(localStorage.getItem(AUTH_KEY))||{users:[],currentUserId:null}}catch{auth={users:[],currentUserId:null}}
    if(!Array.isArray(auth.users)||!auth.users.length){
      try{auth=JSON.parse(localStorage.getItem(AUTH_BACKUP_KEY))||{users:[],currentUserId:null}}catch{auth={users:[],currentUserId:null}}
    }
    // Online: recupera a lista remota sem publicar nada nesta abertura.
    if((!Array.isArray(auth.users)||!auth.users.length)&&connectionIsOnline()){
      const remote=await remoteGet(AUTH_KEY);
      if(remote&&Array.isArray(remote.users)&&remote.users.length){
        auth={...remote,currentUserId:null};
      }
    }
    if(!Array.isArray(auth.users))auth.users=[];
    auth.users=auth.users.map(u=>({...u,accessLevel:u.role==='admin'?'full':(u.accessLevel||'full')}));
    // Nunca recria automaticamente o usuário "edson", nunca reseta senhas e
    // nunca sobrescreve o Supabase durante o bootstrap desta tela.
    auth.currentUserId=null;
    localStorage.setItem(AUTH_KEY,JSON.stringify(auth));
    if(auth.users.length)localStorage.setItem(AUTH_BACKUP_KEY,JSON.stringify({...auth,currentUserId:null}));
    currentUser=null;
  }
  function saveAuth(){
    localStorage.setItem(AUTH_KEY,JSON.stringify(auth));
    if(Array.isArray(auth.users)&&auth.users.length){
      localStorage.setItem(AUTH_BACKUP_KEY,JSON.stringify({...auth,currentUserId:null}));
      remoteSet(AUTH_KEY,auth);
    }
  }
  async function ensureAuthFromRemote(){
    if(!connectionIsOnline())return false;
    const remote=await remoteGet(AUTH_KEY);
    if(!(remote&&Array.isArray(remote.users)&&remote.users.length))return false;
    const previousUsername=currentUser?.username;
    const previousId=currentUser?.id;
    auth={...remote,currentUserId:previousId||null};
    auth.users=auth.users.map(u=>({...u,accessLevel:u.role==='admin'?'full':(u.accessLevel||'full')}));
    localStorage.setItem(AUTH_KEY,JSON.stringify(auth));
    localStorage.setItem(AUTH_BACKUP_KEY,JSON.stringify({...auth,currentUserId:null}));
    if(previousId||previousUsername){
      currentUser=auth.users.find(u=>u.id===previousId)||auth.users.find(u=>u.username===previousUsername)||null;
    }
    return true;
  }

  function migrateEquipment(x){
    return {
      ...x,
      id:x.id||newId(),
      category:legacyCategory[x.category]||x.category||CATEGORIES[0],
      status:legacyStatus[x.status]||x.status||STATUSES[0],
      client:String(x.client||'').trim()||DEFAULT_CLIENTS[String(x.prefix||'').trim().toUpperCase()]||'',
      loadStatus:x.loadStatus||'',
      substitute:x.substitute||'',
      condition:x.condition||'',
      notes:x.notes||'',
      maintenanceLocation:x.maintenanceLocation||'',
      maintenanceReason:x.maintenanceReason||'',
      updatedAt:x.updatedAt||new Date().toISOString(),
      updateControl:x.updateControl==='updated'?'updated':'pending'
    };
  }
  function save(){
    if(!currentUser||isConsultation())return;
    if(!isConsultation()){
      localStorage.setItem(USER_KEY(currentUser.id),JSON.stringify(state));
      remoteSet(USER_KEY(currentUser.id),state);
    }
    scheduleAutoTurnSave();
  }
  function scheduleAutoTurnSave(delay=500){
    if(!autoTurnEnabled||!currentUser||isConsultation())return;
    clearTimeout(autoTurnTimer);
    autoTurnTimer=setTimeout(()=>saveTurnSnapshot('automatic'),delay);
  }
  function flushAutoTurnSave(){
    if(!autoTurnEnabled||!currentUser||isConsultation())return;
    clearTimeout(autoTurnTimer);
    saveTurnSnapshot('automatic');
  }
  function getLastTurn(){try{return JSON.parse(localStorage.getItem(TURN_KEY))}catch{return null}}
  function saveTurnSnapshot(source='manual'){
    if(!currentUser||isConsultation())return;
    const snapshot={
      id:newId(),
      savedAt:new Date().toISOString(),
      source,
      userId:currentUser.id,
      userName:currentUser.name,
      team:currentUser.team,
      equipments:clone(state.equipments),
      settings:clone(state.settings)
    };
    localStorage.setItem(TURN_KEY,JSON.stringify(snapshot));
    remoteSet(TURN_KEY,snapshot);
    return snapshot;
  }
  function applyLastTurn(snapshot){
    if(!snapshot||!Array.isArray(snapshot.equipments))return false;
    state.equipments=clone(snapshot.equipments).map(x=>migrateEquipment(x));
    if(snapshot.settings)state.settings={...state.settings,...snapshot.settings};
    log('Continuidade de turno',`Relatório de ${snapshot.userName||'usuário anterior'} — ${snapshot.team||'turma anterior'} carregado por ${currentUser.name}`);
    save();applyTheme();loadSettingsForm();renderPrefixOptions();renderDashboard();renderEquipments();renderHistory();generateReport();updateTurnPanel();
    return true;
  }
  function updateTurnPanel(){}
  function esc(v=''){return String(v).replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]))}
  function fmtDate(v){return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(v))}
  function loadMaintenanceHistory(){try{maintenanceHistory=JSON.parse(localStorage.getItem(MAINT_HISTORY_KEY))||[]}catch{maintenanceHistory=[]}purgeMaintenanceHistory(false)}
  function purgeMaintenanceHistory(persist=true){const limit=Date.now()-90*24*60*60*1000;maintenanceHistory=(Array.isArray(maintenanceHistory)?maintenanceHistory:[]).filter(x=>new Date(x.savedAt||x.date||0).getTime()>=limit);if(persist){localStorage.setItem(MAINT_HISTORY_KEY,JSON.stringify(maintenanceHistory));remoteSet(MAINT_HISTORY_KEY,maintenanceHistory)}}
  function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2400)}
  function log(action,detail){state.history.unshift({id:newId(),action,detail,date:new Date().toISOString()});state.history=state.history.slice(0,500)}
  function applyTheme(){document.documentElement.classList.toggle('light',state.settings.theme==='light')}
  function setupSelects(){
    $('#filterCategory').innerHTML='<option value="">Todas as categorias</option>'+CATEGORIES.map(x=>`<option>${x}</option>`).join('');
    $('#eqCategory').innerHTML=CATEGORIES.map(x=>`<option>${x}</option>`).join('');
    $('#filterStatus').innerHTML='<option value="">Todos os status</option>'+STATUSES.map(x=>`<option>${x}</option>`).join('');
    $('#eqStatus').innerHTML=STATUSES.map(x=>`<option>${x}</option>`).join('');
    renderPrefixOptions();
  }
  function equipmentLabel(prefix='',capacity=''){
    const p=String(prefix||'').trim().toUpperCase();
    const c=String(capacity||'').trim();
    return c?`${p} (${c})`:p;
  }
  function parseEquipmentLabel(value=''){
    const raw=String(value||'').trim().toUpperCase();
    const match=raw.match(/^([^()]+?)\s*(?:\(([^()]+)\))?$/);
    return {prefix:(match?.[1]||raw).trim(),capacity:(match?.[2]||'').trim().toLowerCase()};
  }
  function normalizeEquipmentPrefix(value=''){
    return String(value||'').trim().toUpperCase().replace(/\s+/g,'');
  }
  function renderPrefixOptions(){
    const items=[
      ...DEFAULT_EQUIPMENTS,
      ...state.equipments.map(x=>({prefix:x.prefix,capacity:x.capacity})),
      ...state.equipments.map(x=>parseEquipmentLabel(x.substitute))
    ].filter(x=>x.prefix);
    const labels=[...new Set(items.map(x=>equipmentLabel(x.prefix,x.capacity)))].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}));
    const options=labels.map(x=>`<option value="${esc(x)}"></option>`).join('');
    $('#prefixOptions').innerHTML=options;
    $('#substituteOptions').innerHTML=options;
  }
  function syncCapacityFromPrefix(){
    const parsed=parseEquipmentLabel($('#eqPrefix').value);
    const found=DEFAULT_EQUIPMENTS.find(x=>x.prefix===parsed.prefix);
    const capacity=parsed.capacity||found?.capacity||'';
    if(capacity)$('#eqCapacity').value=capacity;
  }
  function syncClientFromPrefix(force=false){
    const prefix=parseEquipmentLabel($('#eqPrefix').value).prefix;
    const suggested=DEFAULT_CLIENTS[prefix]||'';
    if(suggested&&(force||!$('#eqClient').value.trim()))$('#eqClient').value=suggested;
  }
  const pageInfo={dashboard:['Dashboard','Visão geral da operação'],equipamentos:['Equipamentos','Cadastro e atualização da frota'],'status-inicial':['Status do Efetivo','Primeira informação operacional enviada ao cliente'],relatorios:['Relatórios','Geração automática para WhatsApp'],historico:['Histórico','Rastreabilidade das alterações'],manutencao:['Histórico Manutenção','Registros fechados por data e turma'],recados:['Central de Recados','Comunicação interna entre líderes'],usuarios:['Usuários','Cadastro exclusivo do administrador'],configuracoes:['Configurações','Preferências e segurança dos dados']};
  function go(page){if(page!=='equipamentos'&&$('#page-equipamentos')?.classList.contains('active')&&hasPendingEquipmentChanges()&&!confirm('Existem alterações que ainda não foram salvas. Deseja realmente sair desta tela?'))return;if(isConsultation()&&['usuarios','configuracoes'].includes(page))page='dashboard';document.body.classList.toggle('equipment-page-active',page==='equipamentos');document.body.classList.toggle('status-initial-page-active',page==='status-inicial');$$('.page').forEach(x=>x.classList.remove('active'));$(`#page-${page}`).classList.add('active');$$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.page===page));$('#pageTitle').textContent=pageInfo[page][0];$('#pageSubtitle').textContent=pageInfo[page][1];$('#sidebar').classList.remove('open');if(page==='dashboard')renderDashboard();if(page==='equipamentos')renderEquipments();if(page==='historico')renderHistory();if(page==='manutencao')renderMaintenanceHistory();if(page==='recados')loadMessages().then(renderMessages);if(page==='status-inicial')window.XCMGInitialStatus?.render?.();if(page==='relatorios')generateReport();if(page==='usuarios')renderUsers()}
  function messagePriorityLabel(value){return value==='high'?'🔴 Alta':value==='low'?'🟢 Baixa':'🟡 Média'}
  function loadMessagesLocal(){try{messages=JSON.parse(localStorage.getItem(MESSAGE_CACHE_KEY))||[]}catch{messages=[]}if(!Array.isArray(messages))messages=[]}
  function saveMessagesLocal(){localStorage.setItem(MESSAGE_CACHE_KEY,JSON.stringify(messages))}
  async function syncPendingMessages(){
    if(!supabaseClient||!connectionIsOnline())return;
    for(const m of messages.filter(x=>x._pendingCreate)){
      const payload={...m};delete payload._pendingCreate;delete payload._pendingRead;delete payload._pendingDelete;
      const {error}=await supabaseClient.from(MESSAGE_TABLE).insert(payload);
      if(!error){delete m._pendingCreate}
    }
    for(const m of messages.filter(x=>x._pendingRead&&!x._pendingCreate)){
      const {error}=await supabaseClient.from(MESSAGE_TABLE).update({read_by:m.read_by||[],read_at:m.read_at||null}).eq('id',m.id);
      if(!error)delete m._pendingRead;
    }
    for(const m of messages.filter(x=>x._pendingDelete&&!x._pendingCreate)){
      const {error}=await supabaseClient.from(MESSAGE_TABLE).delete().eq('id',m.id);
      if(!error)messages=messages.filter(x=>x.id!==m.id);
    }
    saveMessagesLocal();
  }
  async function loadMessages(){
    loadMessagesLocal();
    if(supabaseClient&&connectionIsOnline()){
      await syncPendingMessages();
      const {data,error}=await supabaseClient.from(MESSAGE_TABLE).select('*').order('created_at',{ascending:false}).limit(500);
      if(!error&&Array.isArray(data)){
        const pending=messages.filter(x=>x._pendingCreate||x._pendingDelete||x._pendingRead);
        const map=new Map(data.map(x=>[x.id,x]));pending.forEach(x=>map.set(x.id,{...(map.get(x.id)||{}),...x}));messages=[...map.values()];saveMessagesLocal();
      }
    }
    updateMessageBadge();
  }
  function canSeeMessage(m){
    if(!currentUser)return false;
    if(currentUser.role==='admin')return true;
    return m.sender_id===currentUser.id||m.recipient_type==='all'||m.recipient_id===currentUser.id;
  }
  function isMessageRead(m){return Array.isArray(m.read_by)&&m.read_by.includes(currentUser?.id)}
  function inboxMessages(){return messages.filter(m=>canSeeMessage(m)&&(m.recipient_type==='all'||m.recipient_id===currentUser?.id)&&m.sender_id!==currentUser?.id&&!m._pendingDelete)}
  function updateMessageBadge(){
    const count=inboxMessages().filter(m=>!isMessageRead(m)).length;
    const badge=$('#messageNavCount');if(badge){badge.textContent=count;badge.classList.toggle('hidden',count<1)}
    const inbox=$('#messageInboxCount');if(inbox)inbox.textContent=count?String(count):'0';
  }
  function populateMessageRecipients(){
    const sel=$('#messageRecipient');if(!sel)return;
    const users=auth.users.filter(u=>u.id!==currentUser?.id).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    sel.innerHTML='<option value="all">@Todos os líderes</option>'+users.map(u=>`<option value="${esc(u.id)}">@${esc(u.name)} — ${esc(u.team||'')}</option>`).join('');
  }
  function openMessageModal(){populateMessageRecipients();$('#messageForm').reset();$('#messagePriority').value='medium';$('#messageModalBackdrop').classList.remove('hidden');$('#messageRecipient').focus()}
  function closeMessageModal(){$('#messageModalBackdrop').classList.add('hidden')}
  async function createMessage(e){
    e.preventDefault();
    const recipientValue=$('#messageRecipient').value;
    const recipient=auth.users.find(u=>u.id===recipientValue);
    const m={id:newId(),subject:$('#messageSubject').value.trim(),body:$('#messageBody').value.trim(),sender_id:currentUser.id,sender_name:currentUser.name,sender_team:currentUser.team||'',recipient_type:recipientValue==='all'?'all':'user',recipient_id:recipient?.id||null,recipient_name:recipientValue==='all'?'Todos':(recipient?.name||''),priority:$('#messagePriority').value,equipment:parseEquipmentLabel($('#messageEquipment').value).prefix||'',read_by:[],created_at:new Date().toISOString(),read_at:null};
    if(!m.subject||!m.body){alert('Preencha o assunto e a mensagem.');return}
    let saved=false;
    if(supabaseClient&&connectionIsOnline()){
      const {error}=await supabaseClient.from(MESSAGE_TABLE).insert(m);saved=!error;
      if(error&&String(error.message||'').toLowerCase().includes('does not exist'))alert('A tabela da Central de Recados ainda não foi criada no Supabase. Execute o arquivo SQL entregue com o projeto. O recado ficará salvo neste aparelho até a configuração.');
    }
    if(!saved)m._pendingCreate=true;
    messages.unshift(m);saveMessagesLocal();closeMessageModal();messageTab='sent';renderMessages();updateMessageBadge();toast(saved?'Recado enviado':'Recado salvo e aguardando sincronização');
  }
  async function markMessageRead(id){
    const m=messages.find(x=>x.id===id);if(!m||isMessageRead(m))return;
    m.read_by=[...new Set([...(m.read_by||[]),currentUser.id])];m.read_at=new Date().toISOString();
    if(supabaseClient&&connectionIsOnline()&&!m._pendingCreate){const {error}=await supabaseClient.from(MESSAGE_TABLE).update({read_by:m.read_by,read_at:m.read_at}).eq('id',id);if(error)m._pendingRead=true}else m._pendingRead=true;
    saveMessagesLocal();updateMessageBadge();renderMessages();
  }
  async function deleteMessage(id){
    const m=messages.find(x=>x.id===id);if(!m)return;
    const allowed=currentUser?.role==='admin'||m.sender_id===currentUser?.id;if(!allowed){alert('Você não possui permissão para excluir este recado.');return}
    if(!confirm('Excluir este recado? Esta ação não poderá ser desfeita.'))return;
    if(m._pendingCreate){messages=messages.filter(x=>x.id!==id)}else if(supabaseClient&&connectionIsOnline()){
      const {error}=await supabaseClient.from(MESSAGE_TABLE).delete().eq('id',id);if(!error)messages=messages.filter(x=>x.id!==id);else m._pendingDelete=true;
    }else m._pendingDelete=true;
    saveMessagesLocal();renderMessages();updateMessageBadge();toast('Recado excluído');
  }
  function messageShareText(m){return `📬 RECADO XCMG REPORT\n\n${messagePriorityLabel(m.priority)}\nAssunto: ${m.subject}${m.equipment?`\nEquipamento: ${m.equipment}`:''}\n\n${m.body}\n\nDe: ${m.sender_name} — ${m.sender_team||'Turma não informada'}\nEnviado em: ${fmtDate(m.created_at)}\n\n📱 Gerado por XCMG REPORT`}
  function renderMessages(){
    if(!currentUser)return;updateMessageBadge();
    $$('.message-tab').forEach(b=>b.classList.toggle('active',b.dataset.messageTab===messageTab));
    const q=($('#messageSearch')?.value||'').trim().toLowerCase(),p=$('#messagePriorityFilter')?.value||'';
    let list=messageTab==='sent'?messages.filter(m=>m.sender_id===currentUser.id&&!m._pendingDelete):messageTab==='all'&&currentUser.role==='admin'?messages.filter(m=>!m._pendingDelete):inboxMessages();
    list=list.filter(m=>(!p||m.priority===p)&&(!q||[m.subject,m.body,m.sender_name,m.recipient_name,m.equipment].join(' ').toLowerCase().includes(q))).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    const box=$('#messageList'),empty=$('#messageEmpty');empty.classList.toggle('hidden',list.length>0);
    box.innerHTML=list.map(m=>{const unread=messageTab==='inbox'&&!isMessageRead(m);const canDelete=currentUser.role==='admin'||m.sender_id===currentUser.id;return `<article class="message-card ${unread?'unread':''} priority-${esc(m.priority)}" data-message-card="${m.id}"><div class="message-card-head"><div><span class="message-priority">${messagePriorityLabel(m.priority)}</span><h3>${esc(m.subject)}</h3></div><div class="message-meta"><span>${fmtDate(m.created_at)}</span>${unread?'<strong>Novo</strong>':'<span>Lido</span>'}</div></div><div class="message-route"><span>De: <strong>${esc(m.sender_name)}</strong> — ${esc(m.sender_team||'')}</span><span>Para: <strong>${m.recipient_type==='all'?'Todos':esc(m.recipient_name||'')}</strong></span></div>${m.equipment?`<div class="message-equipment">🚜 ${esc(m.equipment)}</div>`:''}<p class="message-body">${esc(m.body).replace(/\n/g,'<br>')}</p><div class="message-actions">${unread?`<button class="btn small primary" data-read-message="${m.id}">Marcar como lido</button>`:''}<button class="btn small" data-copy-message="${m.id}">Copiar</button><button class="btn small" data-share-message="${m.id}">Compartilhar</button>${canDelete?`<button class="btn small danger" data-delete-message="${m.id}">Excluir</button>`:''}${m._pendingCreate||m._pendingRead||m._pendingDelete?'<span class="message-sync">Aguardando sincronização</span>':''}</div></article>`}).join('');
  }
  function getMaintenanceItems(){
    // Manutenção = preventiva + corretiva + equipamentos substituídos.
    // Cada prefixo é contado uma única vez. Renovação do selo tem prioridade
    // e fica sempre fora da manutenção.
    const items=new Map();
    const sealPrefixes=new Set(
      state.equipments
        .filter(x=>x.status==='Renovação do selo (Vale)')
        .map(x=>String(x.prefix||'').trim().toUpperCase())
        .filter(Boolean)
    );
    state.equipments.filter(x=>['Preventiva','Corretiva'].includes(x.status)).forEach(x=>{
      const key=String(x.prefix||'').trim().toUpperCase();
      if(!key||sealPrefixes.has(key))return;
      items.set(key,{prefix:key,capacity:x.capacity||'',status:x.status,location:x.location||'',maintenanceLocation:x.maintenanceLocation||'',maintenanceReason:x.maintenanceReason||'',replacedBy:[]});
    });
    state.equipments.forEach(x=>{
      const sub=parseEquipmentLabel(x.substitute);
      if(!sub.prefix)return;
      const key=sub.prefix.trim().toUpperCase();
      if(sealPrefixes.has(key))return;
      const substitutedEquipment=state.equipments.find(e=>String(e.prefix||'').trim().toUpperCase()===key);
      const current=items.get(key)||{prefix:key,capacity:sub.capacity||'',status:'Substituído',location:'',maintenanceLocation:'',maintenanceReason:'',replacedBy:[]};
      current.capacity=current.capacity||sub.capacity||substitutedEquipment?.capacity||'';
      const replacement=equipmentLabel(x.prefix,x.capacity);
      if(replacement&&!current.replacedBy.includes(replacement))current.replacedBy.push(replacement);
      // O local do equipamento substituído pode estar salvo no campo interno
      // da manutenção ou na localização operacional. Prioriza a informação
      // interna, mas usa os demais campos como fallback para não perder o local.
      current.maintenanceLocation=current.maintenanceLocation
        ||substitutedEquipment?.maintenanceLocation
        ||x.maintenanceLocation
        ||substitutedEquipment?.location
        ||x.location
        ||'';
      current.location=current.location
        ||substitutedEquipment?.location
        ||x.location
        ||'';
      current.maintenanceReason=current.maintenanceReason
        ||substitutedEquipment?.maintenanceReason
        ||x.maintenanceReason
        ||'';
      if(!current.status||current.status==='Substituído')current.status='Substituído';
      items.set(key,current);
    });
    return [...items.values()].sort((a,b)=>a.prefix.localeCompare(b.prefix,'pt-BR',{numeric:true}));
  }
  function getSealRenewalItems(){
    const items=new Map();
    state.equipments.filter(x=>x.status==='Renovação do selo (Vale)').forEach(x=>{
      const key=String(x.prefix||'').trim().toUpperCase();
      if(!key)return;
      items.set(key,{prefix:key,capacity:x.capacity||'',location:x.location||'',notes:x.notes||''});
    });
    return [...items.values()].sort((a,b)=>a.prefix.localeCompare(b.prefix,'pt-BR',{numeric:true}));
  }
  function renderDashboard(){
    const e=state.equipments;
    const prefixOf=x=>String(x?.prefix||'').trim().toUpperCase();
    const maintenanceItems=getMaintenanceItems();
    const maintenancePrefixes=new Set(maintenanceItems.map(x=>x.prefix));
    const sealItems=getSealRenewalItems();
    const sealPrefixes=new Set(sealItems.map(x=>x.prefix));

    // Universo da frota: todos os equipamentos cadastrados + todos os prefixos
    // informados como equipamentos substituídos. O Set elimina duplicidades.
    const fleetPrefixes=new Set();
    e.forEach(x=>{
      const own=prefixOf(x);
      if(own)fleetPrefixes.add(own);
      const replaced=parseEquipmentLabel(x.substitute).prefix;
      if(replaced)fleetPrefixes.add(replaced.trim().toUpperCase());
    });

    // Os indicadores são mutuamente exclusivos por prefixo:
    // selo > manutenção > atendimento > disponível.
    const availablePrefixes=new Set();
    const servicePrefixes=new Set();
    e.forEach(x=>{
      const key=prefixOf(x);
      if(!key||sealPrefixes.has(key)||maintenancePrefixes.has(key))return;
      if(x.status==='Em atendimento')servicePrefixes.add(key);
      else if(x.status==='Disponível')availablePrefixes.add(key);
    });

    const total=fleetPrefixes.size;
    const maint=maintenancePrefixes.size;
    const sealCount=sealPrefixes.size;
    const lowPrefixes=new Set(
      e.filter(x=>Number(x.fuel)<=state.settings.fuelLimit).map(prefixOf).filter(Boolean)
    );
    const low=lowPrefixes.size;
    const cards=[
      ['Frota ativa',total,'Equipamentos cadastrados','#0891b2'],
      ['Disponíveis',availablePrefixes.size,'Prontos para operação','#16a34a'],
      ['Em atendimento',servicePrefixes.size,'Em operação','#2563eb'],
      ['Em manutenção',maint,'Preventiva • Corretiva • Substituídos','#dc2626'],
      ['Renovação do selo',sealCount,'Processo Vale','#ca8a04'],
      [`Combustível ≤ ${state.settings.fuelLimit}%`,low,'Equipamentos em alerta','#d97706']
    ];
    $('#stats').innerHTML=cards.map(c=>`<div class="stat" style="--accent:${c[3]}"><div class="stat-accent"></div><div class="label">${c[0]}</div><div class="value">${c[1]}</div><div class="hint">${c[2]}</div></div>`).join('');
    $('#maintenanceList').innerHTML=maintenanceItems.map(x=>{
      const hasReplacement=x.replacedBy.length>0;
      const statusLabel=x.status==='Substituído'?'Substituído':x.status;
      const displayedLocation=x.maintenanceLocation||x.location||'Sem localização informada';
      const detail=hasReplacement
        ? `${esc(displayedLocation)}<br>Substituído por <b>${esc(x.replacedBy.join(', '))}</b>`
        : esc(displayedLocation);
      return `<div class="maintenance-item"><div class="maintenance-main"><strong>${esc(equipmentLabel(x.prefix,x.capacity))}</strong><span>${esc(statusLabel)}</span></div><small>${detail}</small></div>`;
    }).join('')||'<div class="empty dashboard-empty compact"><span class="empty-icon">✓</span><strong>Nenhum equipamento em manutenção</strong><small>Não há preventiva, corretiva ou equipamento substituído.</small></div>';
    $('#sealRenewalList').innerHTML=sealItems.map(x=>`<div class="seal-item"><div><strong>${esc(equipmentLabel(x.prefix,x.capacity))}</strong><span>Renovação do selo (Vale)</span></div><small>${esc(x.location||'Sem localização informada')}${x.notes?` — ${esc(x.notes)}`:''}</small></div>`).join('')||'<div class="empty dashboard-empty compact"><span class="empty-icon">✓</span><strong>Nenhum selo em renovação</strong><small>Não há equipamentos neste processo.</small></div>';
    $('#statusBars').innerHTML=STATUSES.map(s=>{const n=new Set(e.filter(x=>x.status===s).map(prefixOf).filter(Boolean)).size,p=total?Math.round(n/total*100):0;return `<div class="bar-row"><span>${s}</span><div class="bar-track"><div class="bar-fill" style="width:${p}%;background:${statusColor[s]}"></div></div><b>${n}</b></div>`}).join('');
    const alerts=[];
    e.filter(x=>Number(x.fuel)<=state.settings.fuelLimit).forEach(x=>alerts.push(`<div class="alert"><strong>${esc(x.prefix)} com ${x.fuel}% de combustível</strong><small>${esc(x.location)} — nível abaixo do limite operacional</small></div>`));
    e.filter(x=>x.status==='Corretiva').forEach(x=>alerts.push(`<div class="alert"><strong>${esc(x.prefix)} — manutenção corretiva</strong><small>${esc(x.location)} ${x.notes?'— '+esc(x.notes):''}</small></div>`));
    $('#alerts').innerHTML=alerts.join('')||'<div class="empty dashboard-empty"><span class="empty-icon">✓</span><strong>Nenhum alerta operacional</strong><small>Todos os indicadores estão dentro dos parâmetros definidos.</small></div>';
    $('#recentUpdates').innerHTML=state.history.slice(0,5).map(h=>`<div class="recent"><strong>${esc(h.action)}</strong><small>${esc(h.detail)} • ${fmtDate(h.date)}</small></div>`).join('')||'<div class="empty">Nenhuma alteração registrada.</div>';
  }
  function pendingEquipmentCount(){return state.equipments.filter(x=>x.updateControl==='pending').length;}
  function hasPendingEquipmentChanges(){return pendingEquipmentCount()>0;}
  function updatePendingEquipmentCount(){
    const badge=$('#equipmentPendingCount');if(!badge)return;
    const count=pendingEquipmentCount();
    badge.textContent=`Pendentes: ${count}`;
    badge.classList.toggle('has-pending',count>0);
    badge.classList.toggle('all-saved',count===0);
  }
  function setControlVisual(id,status){
    const btn=document.querySelector(`[data-update-control="${id}"]`);if(!btn)return;
    const updated=status==='updated';
    btn.classList.toggle('is-updated',updated);
    btn.classList.toggle('is-pending',!updated);
    btn.textContent=updated?'✓ Conferido':'⚠ Pendente';
  }
  function renderEquipments(){
    const q=$('#searchInput').value.trim().toLowerCase(),cat=$('#filterCategory').value,st=$('#filterStatus').value;
    const list=state.equipments
      .filter(x=>(!q||[x.prefix,x.category,x.location,x.capacity,x.client,x.condition,x.notes,x.substitute].join(' ').toLowerCase().includes(q))&&(!cat||x.category===cat)&&(!st||x.status===st))
      .sort(compareEquipments);
    const statusGroup=x=>['Preventiva','Corretiva'].includes(x.status)?'maintenance':x.status;
    const statusButtons=x=>{
      const current=statusGroup(x);
      const buttons=[
        ['Disponível','🟢','Disponível'],
        ['Em atendimento','🔵','Em atendimento'],
        ['maintenance','🔴',x.status==='Corretiva'?'Corretiva':'Manutenção'],
        ['Renovação do selo (Vale)','🟡','Renovação do selo']
      ];
      return `<div class="status-buttons" data-field="status" data-id="${x.id}" data-value="${esc(x.status)}">${buttons.map(([value,emoji,label])=>`<button type="button" class="status-dot ${current===value?'active':''}" data-status-choice="${esc(value)}" ${isConsultation()?'disabled':''} title="${esc(label)}" aria-label="${esc(label)}">${emoji}</button>`).join('')}</div>`;
    };
    $('#equipmentGrid').innerHTML=`<div class="equipment-table-wrap"><table class="equipment-table"><thead><tr><th>Equipamento</th><th>Status</th><th>Cliente</th><th>Localização</th><th>Condição / posicionamento</th><th>Combustível</th><th class="substitute-col">Substitui</th><th>Controle</th><th>Ações</th></tr></thead><tbody>${list.map(x=>`<tr style="--status-color:${statusColor[x.status]||'#1d8cff'}" data-equipment-row="${x.id}"><td data-label="Equipamento" class="equipment-id-cell"><strong>${esc(x.prefix)}</strong>${x.capacity?`<small>${esc(x.capacity)}</small>`:''}</td><td data-label="Status">${statusButtons(x)}</td><td data-label="Cliente"><input class="quick-field client-quick-field" data-field="client" ${isConsultation()?'disabled':''} data-id="${x.id}" value="${esc(x.client||DEFAULT_CLIENTS[String(x.prefix||'').trim().toUpperCase()]||'')}" list="clientOptions" placeholder="Cliente"></td><td data-label="Localização"><input class="quick-field" data-field="location" ${isConsultation()?'disabled':''} data-id="${x.id}" value="${esc(x.location||'')}" list="locationOptions"></td><td data-label="Condição / posicionamento"><input class="quick-field" data-field="condition" ${isConsultation()?'disabled':''} data-id="${x.id}" value="${esc([x.loadStatus,x.condition].filter(Boolean).join(', '))}" placeholder="Patolado, estacionado..."></td><td data-label="Combustível"><div class="fuel-edit"><input type="number" min="0" max="100" class="quick-field" data-field="fuel" ${isConsultation()?'disabled':''} data-id="${x.id}" value="${Number(x.fuel)||0}"><span>%</span></div></td><td data-label="Substitui" class="substitute-cell"><input class="quick-field substitute-quick-field" data-field="substitute" ${isConsultation()?'disabled':''} data-id="${x.id}" value="${esc(x.substitute||'')}" list="substituteOptions" placeholder="—"></td><td data-label="Conferência" class="control-cell"><button type="button" class="update-control ${x.updateControl==='updated'?'is-updated':'is-pending'}" data-update-control="${x.id}" ${isConsultation()?'disabled':''} title="Clique para alterar manualmente entre Conferido e Pendente">${x.updateControl==='updated'?'✓ Conferido':'⚠ Pendente'}</button></td><td data-label="Ações" class="row-actions">${isConsultation()?'<span class="muted">Somente consulta</span>':`<button class="btn small primary" data-quick-save="${x.id}">Salvar</button><button class="btn small" data-edit="${x.id}">Detalhes</button><button class="icon-delete" title="Excluir" data-delete="${x.id}">×</button>`}</td></tr>`).join('')}</tbody></table></div>`;
    $('#equipmentEmpty').classList.toggle('hidden',list.length>0);
    updatePendingEquipmentCount();
  }
  function quickSaveEquipment(id){if(denyConsultation())return;
    const x=state.equipments.find(e=>e.id===id);if(!x)return;
    const row=document.querySelector(`[data-quick-save="${id}"]`)?.closest('tr');if(!row)return;
    const value=field=>{const el=row.querySelector(`[data-field="${field}"]`);return el?.dataset?.value??el?.value??'';};
    const condition=value('condition').trim();
    const substitute=parseEquipmentLabel(value('substitute'));
    x.status=value('status')||x.status;x.client=value('client').trim();x.location=value('location').trim();x.condition=condition;x.loadStatus='';
    x.fuel=Math.max(0,Math.min(100,Number(value('fuel'))||0));
    x.substitute=substitute.prefix?equipmentLabel(substitute.prefix,substitute.capacity):'';
    const needsMaintenanceReason=Boolean(substitute.prefix)||['Preventiva','Corretiva'].includes(x.status);
    if(!needsMaintenanceReason){x.maintenanceReason='';x.maintenanceLocation='';}
    if(needsMaintenanceReason&&!String(x.maintenanceReason||'').trim()){
      openModal(id);
      alert('Preencha o Motivo da Manutenção em 🔧 Apoio à Manutenção. Essa informação será usada somente no Histórico de Manutenção.');
      return;
    }
    if(needsMaintenanceReason&&!String(x.maintenanceLocation||'').trim()){
      openModal(id);
      alert('Preencha o Local da Manutenção em 🔧 Apoio à Manutenção.');
      return;
    }
    x.updatedAt=new Date().toISOString();
    x.updateControl='updated';
    log('Equipamento atualizado',`${x.prefix} — ${x.status} em ${x.location}`);save();renderPrefixOptions();renderDashboard();setControlVisual(id,'updated');updatePendingEquipmentCount();toast(`${x.prefix} atualizado com sucesso`);
  }
  function toggleUpdateControl(id){if(denyConsultation())return;
    const x=state.equipments.find(e=>e.id===id);if(!x)return;
    const next=x.updateControl==='updated'?'pending':'updated';
    x.updateControl=next;
    x.updatedAt=new Date().toISOString();
    setControlVisual(id,next);
    updatePendingEquipmentCount();
    log('Controle de conferência alterado',`${x.prefix} — ${next==='updated'?'Conferido':'Pendente'}`);
    save();
    toast(`${x.prefix}: ${next==='updated'?'Conferido':'Pendente'}`);
  }
  function markRowPending(id){
    const x=state.equipments.find(e=>e.id===id);if(!x||x.updateControl==='pending')return;
    x.updateControl='pending';
    setControlVisual(id,'pending');
    updatePendingEquipmentCount();
  }
  function updateCategoryFields(){
    const isMunck=$('#eqCategory').value==='GUINDAUTO SKY MUNCK';
    $('#loadStatusField').classList.toggle('hidden',!isMunck);
    if(!isMunck)$('#eqLoadStatus').value='';
  }
  function updateMaintenanceDetailsVisibility(){
    const hasSubstitute=Boolean(parseEquipmentLabel($('#eqSubstitute').value).prefix);
    const isMaintenanceStatus=['Preventiva','Corretiva'].includes($('#eqStatus').value);
    const showSection=hasSubstitute||isMaintenanceStatus;
    $('#maintenanceDetailsSection').classList.toggle('hidden',!showSection);
    $('#maintenanceLocationField').classList.toggle('hidden',!showSection);
    $('#eqMaintenanceLocation').required=showSection;
    $('#eqMaintenanceReason').required=showSection;
    if(!showSection)$('#eqMaintenanceLocation').value='';
    if(!showSection)$('#eqMaintenanceReason').value='';
  }
  function openModal(id){if(denyConsultation())return;
    const x=state.equipments.find(e=>e.id===id);
    $('#equipmentId').value=x?.id||'';
    $('#modalTitle').textContent=x?'Editar equipamento':'Novo equipamento';
    $('#eqPrefix').value=x?.prefix||'';
    $('#eqCategory').value=x?.category||CATEGORIES[0];
    $('#eqCapacity').value=x?.capacity||'';
    $('#eqStatus').value=x?.status||STATUSES[0];
    $('#eqClient').value=x?.client||DEFAULT_CLIENTS[String(x?.prefix||'').trim().toUpperCase()]||'';
    $('#eqLocation').value=x?.location||'';
    $('#eqLoadStatus').value=x?.loadStatus||'';
    $('#eqSubstitute').value=x?.substitute||'';
    $('#eqFuel').value=x?.fuel??100;
    $('#eqCondition').value=x?.condition||'';
    $('#eqNotes').value=x?.notes||'';
    $('#eqMaintenanceLocation').value=x?.maintenanceLocation||'';
    $('#eqMaintenanceReason').value=x?.maintenanceReason||'';
    updateCategoryFields();
    updateMaintenanceDetailsVisibility();
    $('#modalBackdrop').classList.remove('hidden');
  }
  function closeModal(){$('#modalBackdrop').classList.add('hidden');$('#equipmentForm').reset()}
  function submitEquipment(ev){if(denyConsultation()){ev.preventDefault();return;}
    ev.preventDefault();
    const id=$('#equipmentId').value,now=new Date().toISOString();
    const selected=parseEquipmentLabel($('#eqPrefix').value);
    selected.prefix=normalizeEquipmentPrefix(selected.prefix);
    const substitute=parseEquipmentLabel($('#eqSubstitute').value);
    const status=$('#eqStatus').value;
    const needsMaintenanceReason=substitute.prefix||['Preventiva','Corretiva'].includes(status);
    if(needsMaintenanceReason&&!$('#eqMaintenanceReason').value.trim()){
      alert('Informe o motivo da manutenção. Essa informação será usada somente no Histórico de Manutenção.');
      $('#maintenanceDetailsSection').classList.remove('hidden');
      $('#eqMaintenanceReason').focus();
      return;
    }
    if(needsMaintenanceReason&&!$('#eqMaintenanceLocation').value.trim()){
      alert('Informe o local da manutenção. Essa informação será usada somente no Histórico de Manutenção.');
      $('#maintenanceDetailsSection').classList.remove('hidden');
      $('#maintenanceLocationField').classList.remove('hidden');
      $('#eqMaintenanceLocation').focus();
      return;
    }
    const duplicate=state.equipments.find(x=>x.id!==id&&normalizeEquipmentPrefix(x.prefix)===selected.prefix);
    if(duplicate){
      alert(`O equipamento ${selected.prefix} já está cadastrado. Não é permitido cadastrar o mesmo equipamento novamente.`);
      $('#eqPrefix').focus();
      $('#eqPrefix').select();
      return;
    }
    const data={
      id:id||newId(),prefix:selected.prefix,category:$('#eqCategory').value,
      capacity:($('#eqCapacity').value.trim()||selected.capacity),status:$('#eqStatus').value,client:$('#eqClient').value.trim()||DEFAULT_CLIENTS[selected.prefix]||'',
      location:$('#eqLocation').value.trim(),loadStatus:$('#eqLoadStatus').value,
      substitute:substitute.prefix?equipmentLabel(substitute.prefix,substitute.capacity):'',
      fuel:Number($('#eqFuel').value)||0,condition:$('#eqCondition').value.trim(),notes:$('#eqNotes').value.trim(),
      maintenanceLocation:needsMaintenanceReason?$('#eqMaintenanceLocation').value.trim():'',maintenanceReason:needsMaintenanceReason?$('#eqMaintenanceReason').value.trim():'',
      updatedAt:now,updateControl:'updated'
    };
    if(id){const i=state.equipments.findIndex(x=>x.id===id);state.equipments[i]=data;log('Equipamento atualizado',`${data.prefix} — ${data.status} em ${data.location}`)}
    else{state.equipments.push(data);log('Equipamento cadastrado',`${data.prefix} — ${data.category}`)}
    save();renderPrefixOptions();closeModal();renderEquipments();renderDashboard();toast('Equipamento salvo com sucesso');
  }
  function deleteEquipment(id){if(denyConsultation())return;const x=state.equipments.find(e=>e.id===id);if(!x||!confirm(`Excluir o equipamento ${x.prefix}?`))return;state.equipments=state.equipments.filter(e=>e.id!==id);log('Equipamento excluído',x.prefix);save();renderPrefixOptions();renderEquipments();renderDashboard();toast('Equipamento excluído')}
  function oneLine(v=''){return String(v).replace(/\s+/g,' ').trim()}
  function emojiForStatus(status=''){
    const normalized=oneLine(status).toLowerCase();
    if(normalized.includes('aguardando')||normalized.includes('disponível')||normalized.includes('disponivel'))return '🟢';
    if(normalized.includes('atendimento')||normalized.includes('atendeu')||normalized.includes('patolado'))return '🔵';
    if(normalized.includes('renovação do selo')||normalized.includes('renovacao do selo'))return '🟡';
    if(normalized.includes('preventiva')||normalized.includes('corretiva')||normalized.includes('manutenção')||normalized.includes('manutencao'))return '🔴';
    return statusEmoji[status]||'🔴';
  }
  function equipmentLine(x){
    const substitute=oneLine(x.substitute);
    const capacity=oneLine(x.capacity);
    const sub=substitute?` (Sub. ${substitute})`:'';
    const cap=capacity?` (${capacity})`:'';
    const prefix=`${emojiForStatus(x.status)}*${oneLine(x.prefix)}${cap}${sub}*`;
    const parts=[];
    const client=oneLine(x.client);
    const location=oneLine(x.location);
    const loadStatus=oneLine(x.loadStatus).toLowerCase();
    const condition=oneLine(x.condition);
    const status=oneLine(x.status);
    const notes=oneLine(x.notes);
    if(client)parts.push(client);
    if(location)parts.push(location);
    if(loadStatus)parts.push(loadStatus);
    if(condition)parts.push(condition);
    if(['Preventiva','Corretiva','Renovação do selo (Vale)'].includes(status) && !parts.some(v=>v.toLowerCase().includes(status.toLowerCase())))parts.push(status);
    if(!parts.length && status)parts.push(status);
    if(Number.isFinite(Number(x.fuel)))parts.push(`${Number(x.fuel)}%⛽${Number(x.fuel)<=state.settings.fuelLimit?'⚠️':''}`);
    if(notes)parts.push(notes);
    return `${prefix} – ${parts.join(' – ')}`;
  }
  function loadReportDefaults(){
    const d=state.reportDefaults||{};
    $('#reportTeam').value=d.team||currentUser?.team||'';
    $('#reportSupervisor').value=d.supervisor||'';
    $('#reportProgrammer').value=d.programmer||currentUser?.name||'';
    $('#reportSafety').value=d.safety||'';
    $('#reportRigger').value=d.rigger||'';
  }
  function saveReportDefaults(){if(isConsultation())return;
    if(!currentUser)return;
    state.reportDefaults={
      team:$('#reportTeam').value.trim(),
      supervisor:$('#reportSupervisor').value.trim(),
      programmer:$('#reportProgrammer').value.trim(),
      safety:$('#reportSafety').value.trim(),
      rigger:$('#reportRigger').value.trim()
    };
    if(!isConsultation()){
      localStorage.setItem(USER_KEY(currentUser.id),JSON.stringify(state));
      remoteSet(USER_KEY(currentUser.id),state);
    }
    scheduleAutoTurnSave();
  }
  function reportText(){
    const date=$('#reportDate').value?new Date($('#reportDate').value+'T12:00:00'):new Date(),d=new Intl.DateTimeFormat('pt-BR').format(date),team=$('#reportTeam').value.trim();
    const greeting=$('#reportGreeting').value || 'Bom dia';
    let out=`*${greeting} a todos!*\n\n*${state.settings.title} – ${d} – ${team.toUpperCase()}*\n\n`;
    const fields=[['Supervisor',$('#reportSupervisor').value],['Téc. de Programação',$('#reportProgrammer').value],['Téc. de Segurança',$('#reportSafety').value],['Projetista/Rigger',$('#reportRigger').value]];
    out+=fields.filter(x=>x[1].trim()).map(x=>`*${x[0]}:* ${x[1].trim()}`).join('\n');
    out+='\n\n*Posicionamento dos Equipamentos:*\n';
    CATEGORIES.forEach(cat=>{
      const list=state.equipments.filter(x=>x.category===cat).sort((a,b)=>a.prefix.localeCompare(b.prefix,'pt-BR',{numeric:true}));
      if(!list.length)return;
      out+=`\n*${cat}:*\n`;
      list.forEach(x=>{out+=`\n${equipmentLine(x)}\n`});
    });
    out+='\n\n*Legenda:*\n🟢 Disponível\n🔵 Em atendimento / Atendeu\n🟡 Renovação do selo (Vale)\n🔴 Manutenção';
    out+='\n────────────────────────────────\n\n📱 Gerado por XCMG REPORT';
    return out;
  }
  function generateReport(){$('#reportOutput').value=reportText()}
  function maintenanceMessage(record){
    const date=new Intl.DateTimeFormat('pt-BR').format(new Date(record.reportDate+'T12:00:00'));
    let out=`*EQUIPAMENTOS EM MANUTENÇÃO – MINA – ${date} – ${String(record.team||'').toUpperCase()}*\n\n`;
    if(!record.items.length)return out+'Nenhum equipamento em manutenção no fechamento do turno.';
    out+=record.items.map(x=>{
      const label=equipmentLabel(x.prefix,x.capacity);
      if(x.replacedBy?.length){
        const lines=[`🔴 *${label}* – Em manutenção`];
        if(x.maintenanceLocation)lines.push(`📍 Local: ${x.maintenanceLocation}`);
        if(x.maintenanceReason)lines.push(`🛠 Motivo: ${x.maintenanceReason}`);
        lines.push(`   ↳ Substituído por: ${x.replacedBy.join(', ')}`);
        return lines.join('\n');
      }
      const lines=[`🔴 *${label}* – ${x.status||'Em manutenção'}`];
      if(x.maintenanceLocation)lines.push(`📍 Local: ${x.maintenanceLocation}`);
      if(x.maintenanceReason)lines.push(`🛠 Motivo: ${x.maintenanceReason}`);
      return lines.join('\n');
    }).join('\n');
    out+=`\n\n*Total:* ${record.items.length} equipamento${record.items.length===1?'':'s'} em manutenção.`;
    out+=`\n────────────────────────────────\n\n📱 Gerado por XCMG REPORT`;
    return out;
  }
  function saveMaintenanceSnapshot(){
    const reportDate=$('#reportDate').value||new Date().toISOString().slice(0,10);
    const team=$('#reportTeam').value.trim()||currentUser?.team||'Turma não informada';
    const items=clone(getMaintenanceItems());
    const existingIndex=maintenanceHistory.findIndex(x=>x.reportDate===reportDate&&String(x.team).trim().toLowerCase()===team.trim().toLowerCase());
    const record={id:existingIndex>=0?maintenanceHistory[existingIndex].id:newId(),reportDate,team,savedAt:new Date().toISOString(),savedBy:currentUser?.name||'',items};
    if(existingIndex>=0)maintenanceHistory.splice(existingIndex,1);
    maintenanceHistory.unshift(record);
    purgeMaintenanceHistory();
    renderMaintenanceHistory();
    return record;
  }
  function renderMaintenanceHistory(){
    const host=$('#maintenanceHistoryList');if(!host)return;
    const q=($('#maintenanceHistorySearch')?.value||'').trim().toLowerCase();
    const list=maintenanceHistory.filter(r=>!q||[r.reportDate,r.team,r.savedBy,...r.items.flatMap(x=>[x.prefix,x.capacity,x.status,x.location,x.maintenanceLocation,x.maintenanceReason,...(x.replacedBy||[])])].join(' ').toLowerCase().includes(q));
    host.innerHTML=list.map(r=>{
      const date=new Intl.DateTimeFormat('pt-BR').format(new Date(r.reportDate+'T12:00:00'));
      const rows=r.items.map(x=>{let detail='';if(x.replacedBy?.length){const parts=['<b>Em manutenção</b>'];if(x.maintenanceLocation)parts.push(`📍 Local: ${esc(x.maintenanceLocation)}`);if(x.maintenanceReason)parts.push(`🛠 Motivo: ${esc(x.maintenanceReason)}`);parts.push(`<small>↳ Substituído por: ${esc(x.replacedBy.join(', '))}</small>`);detail=parts.join('<br>')}else{const parts=[`<b>${esc(x.status||'Em manutenção')}</b>`];if(x.maintenanceLocation)parts.push(`📍 Local: ${esc(x.maintenanceLocation)}`);if(x.maintenanceReason)parts.push(`🛠 Motivo: ${esc(x.maintenanceReason)}`);detail=parts.join('<br>')}return `<div class="maintenance-history-row"><strong>${esc(equipmentLabel(x.prefix,x.capacity))}</strong><span>${detail}</span></div>`}).join('')||'<div class="empty compact">Nenhum equipamento em manutenção neste fechamento.</div>';
      const deleteButton=currentUser?.role==='admin'?`<button class="btn small danger" data-delete-maintenance-history="${r.id}">Excluir registro</button>`:'';
      return `<article class="panel maintenance-history-card"><div class="panel-head"><div><span class="eyebrow">${esc(date)}</span><h2>${esc(r.team)}</h2><small>Fechado por ${esc(r.savedBy||'usuário')} em ${fmtDate(r.savedAt)}</small></div><div class="actions"><button class="btn small" data-copy-maintenance="${r.id}">Copiar mensagem</button><button class="btn small" data-share-maintenance="${r.id}">Compartilhar</button>${deleteButton}</div></div><div class="maintenance-history-rows">${rows}</div><div class="maintenance-history-total">Total: <strong>${r.items.length}</strong></div></article>`;
    }).join('')||'<div class="empty">Nenhum fechamento de manutenção registrado nos últimos 90 dias.</div>';
  }
  function deleteMaintenanceHistoryRecord(id){
    if(currentUser?.role!=='admin'){alert('Somente o administrador pode excluir registros do Histórico da Manutenção.');return}
    const record=maintenanceHistory.find(x=>x.id===id);if(!record)return;
    const date=new Intl.DateTimeFormat('pt-BR').format(new Date(record.reportDate+'T12:00:00'));
    if(!confirm(`Excluir o registro de ${date} - ${record.team}?\n\nEsta ação remove somente este fechamento do Histórico da Manutenção e não poderá ser desfeita.`))return;
    maintenanceHistory=maintenanceHistory.filter(x=>x.id!==id);
    localStorage.setItem(MAINT_HISTORY_KEY,JSON.stringify(maintenanceHistory));
    remoteSet(MAINT_HISTORY_KEY,maintenanceHistory);
    renderMaintenanceHistory();
    toast('Registro do Histórico da Manutenção excluído');
  }
  function saveReport(){if(denyConsultation())return;generateReport();const text=$('#reportOutput').value;state.reports.unshift({id:newId(),date:new Date().toISOString(),text});log('Relatório salvo','Relatório salvo com sucesso');save();saveTurnSnapshot('report');saveMaintenanceSnapshot();renderHistory();toast('Relatório salvo e histórico da manutenção atualizado')}
  function renderHistory(){const q=$('#historySearch').value.trim().toLowerCase(),list=state.history.filter(x=>!q||`${x.action} ${x.detail}`.toLowerCase().includes(q));$('#historyList').innerHTML=list.map(h=>`<div class="timeline-item"><div class="timeline-date">${fmtDate(h.date)}</div><div><strong>${esc(h.action)}</strong><div class="muted">${esc(h.detail)}</div></div></div>`).join('')||'<div class="empty">Nenhum registro encontrado.</div>'}
  function loadSettingsForm(){$('#cfgCompany').value=state.settings.company;$('#cfgTitle').value=state.settings.title;$('#cfgFuelLimit').value=state.settings.fuelLimit}
  function renderUsers(){
    if(currentUser?.role!=='admin'){go('dashboard');return}
    $('#userList').innerHTML=auth.users.map(u=>{
      const canDelete=u.id!==currentUser.id;
      return `<div class="user-card"><div><strong>${esc(u.name)}</strong><small>@${esc(u.username)}</small></div><span class="user-badge">${esc(u.team)}</span><span class="user-role">${u.role==='admin'?'Administrador':(u.accessLevel==='consultation'?'Consulta':'Acesso total')}</span><div class="user-actions"><button class="btn small" data-edit-user="${u.id}">Editar usuário</button><button class="btn small" data-reset-password="${u.id}">Redefinir senha</button>${canDelete?`<button class="btn small danger" data-delete-user="${u.id}">Excluir usuário</button>`:'<span class="user-self-note">Usuário atual</span>'}</div></div>`;
    }).join('');
  }
  function prepareUserModal(mode,user=null){
    $('#userForm').reset();
    const editing=mode==='edit'&&user;
    $('#editUserId').value=editing?user.id:'';
    $('#userModalTitle').textContent=editing?'Editar usuário':'Criar usuário';
    $('#saveUserBtn').textContent=editing?'Salvar alterações':'Criar usuário';
    $('#newUserPasswordLabel').firstChild.textContent=editing?'Nova senha (opcional)':'Senha*';
    $('#newUserPassword').required=!editing;
    $('#newUserPassword').value='';
    $('#newUserAccessLevel').disabled=Boolean(editing&&user.role==='admin');
    if(editing){
      $('#userFullName').value=user.name||'';
      $('#userTeam').value=user.team||'';
      $('#newUsername').value=user.username||'';
      $('#newUserAccessLevel').value=user.role==='admin'?'full':(user.accessLevel==='consultation'?'consultation':'full');
    }
  }
  function openUserModal(){if(currentUser?.role!=='admin')return;prepareUserModal('create');$('#userModalBackdrop').classList.remove('hidden');$('#userFullName').focus()}
  function openEditUserModal(userId){
    if(currentUser?.role!=='admin')return;
    const user=auth.users.find(u=>u.id===userId);if(!user)return;
    prepareUserModal('edit',user);$('#userModalBackdrop').classList.remove('hidden');$('#userFullName').focus();
  }
  function closeUserModal(){$('#userModalBackdrop').classList.add('hidden');$('#newUserAccessLevel').disabled=false}
  async function createUser(e){
    e.preventDefault();if(currentUser?.role!=='admin')return;
    if(connectionIsOnline())await ensureAuthFromRemote();
    if(currentUser?.role!=='admin'){alert('Sessão atualizada. Entre novamente para gerenciar usuários.');return}
    const editId=$('#editUserId').value;
    const name=$('#userFullName').value.trim(),team=$('#userTeam').value.trim(),username=$('#newUsername').value.trim().toLowerCase(),password=$('#newUserPassword').value,accessLevel=$('#newUserAccessLevel').value==='consultation'?'consultation':'full';
    if(auth.users.some(u=>u.username.toLowerCase()===username&&u.id!==editId)){alert('Este nome de usuário já existe.');return}
    if(editId){
      const user=auth.users.find(u=>u.id===editId);if(!user)return;
      user.name=name;user.team=team;user.username=username;
      if(user.role!=='admin')user.accessLevel=accessLevel;
      if(password){if(password.length<4){alert('A nova senha deve ter pelo menos 4 caracteres.');return}user.passwordHash=await hashPassword(password)}
      saveAuth();if(user.id===currentUser.id){currentUser=user;$('#currentUserName').textContent=user.name;$('#currentUserTeam').textContent=user.team}closeUserModal();renderUsers();toast('Usuário atualizado com sucesso');return;
    }
    const user={id:newId(),name,team,username,passwordHash:await hashPassword(password),role:'user',accessLevel,createdAt:new Date().toISOString()};
    auth.users.push(user);saveAuth();localStorage.setItem(USER_KEY(user.id),JSON.stringify(clone(initial)));remoteSet(USER_KEY(user.id),clone(initial));closeUserModal();renderUsers();toast('Usuário criado com sucesso');
  }
  async function changeOwnPassword(e){
    e.preventDefault();
    if(connectionIsOnline())await ensureAuthFromRemote();
    if(!currentUser){alert('Sessão atualizada. Entre novamente para alterar a senha.');return}
    const current=$('#currentPassword').value,newPassword=$('#newPassword').value,confirmPassword=$('#confirmNewPassword').value;
    if(await hashPassword(current)!==currentUser.passwordHash){alert('A senha atual está incorreta.');return}
    if(newPassword!==confirmPassword){alert('A confirmação da nova senha não confere.');return}
    if(newPassword.length<4){alert('A nova senha deve ter pelo menos 4 caracteres.');return}
    currentUser.passwordHash=await hashPassword(newPassword);saveAuth();$('#changePasswordForm').reset();log('Senha alterada',`${currentUser.name} alterou a própria senha`);save();renderHistory();toast('Senha alterada com sucesso');
  }
  function openResetPasswordModal(userId){
    if(currentUser?.role!=='admin')return;
    const user=auth.users.find(u=>u.id===userId);if(!user)return;
    $('#resetPasswordForm').reset();$('#resetPasswordUserId').value=user.id;$('#resetPasswordUserName').textContent=`${user.name} (@${user.username})`;$('#resetPasswordModalBackdrop').classList.remove('hidden');$('#adminNewPassword').focus();
  }
  function closeResetPasswordModal(){$('#resetPasswordModalBackdrop').classList.add('hidden')}
  async function resetUserPassword(e){
    e.preventDefault();if(currentUser?.role!=='admin')return;
    const id=$('#resetPasswordUserId').value,password=$('#adminNewPassword').value,confirmPassword=$('#adminConfirmPassword').value;
    if(password!==confirmPassword){alert('A confirmação da nova senha não confere.');return}
    if(password.length<4){alert('A nova senha deve ter pelo menos 4 caracteres.');return}
    const user=auth.users.find(u=>u.id===id);if(!user)return;
    user.passwordHash=await hashPassword(password);saveAuth();closeResetPasswordModal();log('Senha redefinida',`${currentUser.name} redefiniu a senha de ${user.name}`);save();renderHistory();toast('Senha redefinida com sucesso');
  }
  function deleteUser(userId){
    if(currentUser?.role!=='admin')return;
    const user=auth.users.find(u=>u.id===userId);if(!user)return;
    if(user.id===currentUser.id){alert('O usuário atualmente conectado não pode ser excluído.');return}
    const confirmed=confirm(`Excluir o usuário ${user.name} (@${user.username})?\n\nOs dados e relatórios salvos exclusivamente neste dispositivo para esse usuário também serão removidos.`);
    if(!confirmed)return;
    auth.users=auth.users.filter(u=>u.id!==user.id);
    localStorage.removeItem(USER_KEY(user.id));
    remoteDelete(USER_KEY(user.id));
    const last=getLastTurn();
    if(last?.userId===user.id){localStorage.removeItem(TURN_KEY);remoteDelete(TURN_KEY)}
    saveAuth();
    log('Usuário excluído',`${currentUser.name} excluiu o acesso de ${user.name} (@${user.username})`);
    save();renderUsers();renderHistory();updateTurnPanel();toast('Usuário excluído com sucesso');
  }
  async function login(e){
    e.preventDefault();
    const username=$('#loginUsername').value.trim().toLowerCase();
    const passwordHash=await hashPassword($('#loginPassword').value);
    // Online: atualiza a lista a partir do Supabase antes de validar, sem sobrescrever o remoto.
    if(connectionIsOnline()){
      const remote=await remoteGet(AUTH_KEY);
      if(remote&&Array.isArray(remote.users)&&remote.users.length){
        auth={...remote,currentUserId:null};
        auth.users=auth.users.map(u=>({...u,accessLevel:u.role==='admin'?'full':(u.accessLevel||'full')}));
        localStorage.setItem(AUTH_KEY,JSON.stringify(auth));
        localStorage.setItem(AUTH_BACKUP_KEY,JSON.stringify(auth));
      }
    }
    const user=auth.users.find(u=>u.username.toLowerCase()===username&&u.passwordHash===passwordHash);
    if(!user){
      if(!connectionIsOnline()&&(!Array.isArray(auth.users)||!auth.users.length))alert('Para liberar o primeiro acesso offline, conecte-se à internet e entre uma vez neste aparelho.');
      else alert('Usuário ou senha inválidos.');
      return
    }
    // Mantém uma cópia local dos acessos para o próximo login sem internet.
    localStorage.setItem(AUTH_BACKUP_KEY,JSON.stringify({...auth,currentUserId:null}));
    currentUser=user;startSession();
  }
  function logout(){if(hasPendingEquipmentChanges()&&!confirm('Existem alterações que ainda não foram salvas. Deseja realmente sair?'))return;flushAutoTurnSave();auth.currentUserId=null;saveAuth();currentUser=null;location.reload()}
  function startSession(){
    state=loadUserState(currentUser.id);$('#loginScreen').classList.add('hidden');$('.app-shell').classList.remove('hidden');
    $('#currentUserName').textContent=currentUser.name;$('#currentUserTeam').textContent=currentUser.team;
    $$('.admin-only').forEach(el=>el.classList.toggle('hidden',currentUser.role!=='admin'));
    const consultation=isConsultation();
    $('#newMessageBtn')?.classList.remove('hidden');
    $$('.admin-message-tab').forEach(el=>el.classList.toggle('hidden',currentUser.role!=='admin'));
    populateMessageRecipients();
    loadMessages().then(()=>{if($('#page-recados')?.classList.contains('active'))renderMessages()});
    $('#newEquipmentBtn')?.classList.toggle('hidden',consultation);
    $('#saveReportBtn')?.classList.toggle('hidden',consultation);
    $('#clearHistoryBtn')?.classList.toggle('hidden',consultation);
    document.querySelector('[data-page="configuracoes"]')?.classList.toggle('hidden',consultation);
    ['reportDate','reportGreeting','reportTeam','reportSupervisor','reportProgrammer','reportSafety','reportRigger'].forEach(id=>{const el=$('#'+id);if(el)el.disabled=consultation});
    $('#generateReportBtn')?.classList.toggle('hidden',consultation);
    if($('#reportOutput'))$('#reportOutput').readOnly=consultation;
    loadReportDefaults();
    applyTheme();loadSettingsForm();renderDashboard();renderEquipments();renderHistory();renderMaintenanceHistory();generateReport();
    if(!isConsultation()){
      localStorage.setItem(USER_KEY(currentUser.id),JSON.stringify(state));
      remoteSet(USER_KEY(currentUser.id),state);
    }
    const last=getLastTurn();
    if(last&&last.userId!==currentUser.id&&Array.isArray(last.equipments)&&last.equipments.length){
      applyLastTurn(last);
    }
    autoTurnEnabled=true;
  }
  function bind(){
    const loginPassword=$('#loginPassword'),toggleLoginPassword=$('#toggleLoginPassword');
    if(loginPassword&&toggleLoginPassword){
      toggleLoginPassword.onclick=()=>{
        const showing=loginPassword.type==='text';
        loginPassword.type=showing?'password':'text';
        toggleLoginPassword.textContent=showing?'👁':'🙈';
        toggleLoginPassword.setAttribute('aria-label',showing?'Mostrar senha':'Ocultar senha');
        toggleLoginPassword.setAttribute('aria-pressed',String(!showing));
        toggleLoginPassword.title=showing?'Mostrar senha':'Ocultar senha';
        loginPassword.focus({preventScroll:true});
        const end=loginPassword.value.length;
        try{loginPassword.setSelectionRange(end,end)}catch{}
      };
    }
    $('#loginForm').onsubmit=login;$('#logoutBtn').onclick=logout;$('#newUserBtn').onclick=openUserModal;$('#closeUserModalBtn').onclick=closeUserModal;$('#cancelUserModalBtn').onclick=closeUserModal;$('#userForm').onsubmit=createUser;$('#userModalBackdrop').onclick=e=>{if(e.target.id==='userModalBackdrop')closeUserModal()};$('#changePasswordForm').onsubmit=changeOwnPassword;$('#resetPasswordForm').onsubmit=resetUserPassword;$('#closeResetPasswordModalBtn').onclick=closeResetPasswordModal;$('#cancelResetPasswordBtn').onclick=closeResetPasswordModal;$('#resetPasswordModalBackdrop').onclick=e=>{if(e.target.id==='resetPasswordModalBackdrop')closeResetPasswordModal()};
    $('#newMessageBtn').onclick=openMessageModal;$('#closeMessageModalBtn').onclick=closeMessageModal;$('#cancelMessageBtn').onclick=closeMessageModal;$('#messageForm').onsubmit=createMessage;$('#messageModalBackdrop').onclick=e=>{if(e.target.id==='messageModalBackdrop')closeMessageModal()};$('#messageSearch').oninput=renderMessages;$('#messagePriorityFilter').onchange=renderMessages;
    $('#nav').addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b)go(b.dataset.page)});
    document.addEventListener('click',e=>{const g=e.target.closest('[data-go]');if(g)go(g.dataset.go);const ed=e.target.closest('[data-edit]');if(ed)openModal(ed.dataset.edit);const del=e.target.closest('[data-delete]');if(del)deleteEquipment(del.dataset.delete);const control=e.target.closest('[data-update-control]');if(control)toggleUpdateControl(control.dataset.updateControl);const choice=e.target.closest('[data-status-choice]');if(choice){if(denyConsultation())return;const group=choice.closest('[data-field="status"]');if(group){let selected=choice.dataset.statusChoice;if(selected==='maintenance'){const current=group.dataset.value;selected=['Preventiva','Corretiva'].includes(current)?current:'Preventiva';}group.dataset.value=selected;group.querySelectorAll('.status-dot').forEach(btn=>btn.classList.toggle('active',btn===choice));const row=group.closest('tr');if(row){row.style.setProperty('--status-color',statusColor[selected]||'#1d8cff');markRowPending(group.dataset.id);}}}const qs=e.target.closest('[data-quick-save]');if(qs)quickSaveEquipment(qs.dataset.quickSave);const eu=e.target.closest('[data-edit-user]');if(eu)openEditUserModal(eu.dataset.editUser);const rp=e.target.closest('[data-reset-password]');if(rp)openResetPasswordModal(rp.dataset.resetPassword);const du=e.target.closest('[data-delete-user]');if(du)deleteUser(du.dataset.deleteUser);const cm=e.target.closest('[data-copy-maintenance]');if(cm){const r=maintenanceHistory.find(x=>x.id===cm.dataset.copyMaintenance);if(r)navigator.clipboard.writeText(maintenanceMessage(r)).then(()=>toast('Mensagem da manutenção copiada'))}const sm=e.target.closest('[data-share-maintenance]');if(sm){const r=maintenanceHistory.find(x=>x.id===sm.dataset.shareMaintenance);if(r){const text=maintenanceMessage(r);if(navigator.share)navigator.share({title:'Equipamentos em manutenção',text});else navigator.clipboard.writeText(text).then(()=>toast('Mensagem copiada para compartilhar'))}}const dmh=e.target.closest('[data-delete-maintenance-history]');if(dmh)deleteMaintenanceHistoryRecord(dmh.dataset.deleteMaintenanceHistory);const mt=e.target.closest('[data-message-tab]');if(mt){messageTab=mt.dataset.messageTab;renderMessages()}const rm=e.target.closest('[data-read-message]');if(rm)markMessageRead(rm.dataset.readMessage);const dm=e.target.closest('[data-delete-message]');if(dm)deleteMessage(dm.dataset.deleteMessage);const cmsg=e.target.closest('[data-copy-message]');if(cmsg){const m=messages.find(x=>x.id===cmsg.dataset.copyMessage);if(m)navigator.clipboard.writeText(messageShareText(m)).then(()=>toast('Recado copiado'))}const smsg=e.target.closest('[data-share-message]');if(smsg){const m=messages.find(x=>x.id===smsg.dataset.shareMessage);if(m){const text=messageShareText(m);if(navigator.share)navigator.share({title:m.subject,text});else navigator.clipboard.writeText(text).then(()=>toast('Recado copiado para compartilhar'))}}});
    $('#equipmentGrid').addEventListener('input',e=>{const field=e.target.closest('.quick-field');if(field)markRowPending(field.dataset.id);});
    $('#equipmentGrid').addEventListener('change',e=>{const field=e.target.closest('.quick-field');if(field)markRowPending(field.dataset.id);});
    $('#menuBtn').onclick=()=>$('#sidebar').classList.toggle('open');
    $('#themeBtn').onclick=()=>{state.settings.theme=state.settings.theme==='light'?'dark':'light';save();applyTheme()};
    $('#newEquipmentBtn').onclick=()=>{if(!denyConsultation())openModal()};$('#closeModalBtn').onclick=closeModal;$('#cancelModalBtn').onclick=closeModal;
    $('#modalBackdrop').onclick=e=>{if(e.target.id==='modalBackdrop')closeModal()};
    $('#equipmentForm').onsubmit=submitEquipment;$('#eqCategory').onchange=updateCategoryFields;$('#eqStatus').addEventListener('change',updateMaintenanceDetailsVisibility);
    $('#eqSubstitute').addEventListener('input',updateMaintenanceDetailsVisibility);
    $('#eqSubstitute').addEventListener('change',updateMaintenanceDetailsVisibility);
    $('#eqPrefix').addEventListener('change',()=>{syncCapacityFromPrefix();syncClientFromPrefix(true)});
    $('#eqPrefix').addEventListener('input',()=>syncClientFromPrefix(false));
    $('#eqPrefix').addEventListener('input',()=>{if($('#eqPrefix').value.includes('('))syncCapacityFromPrefix()});
    ['searchInput','filterCategory','filterStatus'].forEach(id=>$('#'+id).addEventListener(id==='searchInput'?'input':'change',renderEquipments));
    const hour=new Date().getHours();
    $('#reportGreeting').value=hour<12?'Bom dia':hour<18?'Boa tarde':'Boa noite';
    $('#reportGreeting').addEventListener('change',()=>{generateReport();scheduleAutoTurnSave()});
    $('#reportDate').addEventListener('input',()=>scheduleAutoTurnSave());
    ['reportTeam','reportSupervisor','reportProgrammer','reportSafety','reportRigger'].forEach(id=>$('#'+id).addEventListener('input',()=>{saveReportDefaults();generateReport()}));
    $('#generateReportBtn').onclick=generateReport;$('#saveReportBtn').onclick=saveReport;
    $('#copyReportBtn').onclick=async()=>{generateReport();await navigator.clipboard.writeText($('#reportOutput').value);toast('Relatório copiado')};
    $('#shareReportBtn').onclick=async()=>{generateReport();const text=$('#reportOutput').value;if(navigator.share)await navigator.share({title:'XCMG Report',text});else{await navigator.clipboard.writeText(text);toast('Copiado para compartilhar')}};
    $('#historySearch').oninput=renderHistory;$('#maintenanceHistorySearch').oninput=renderMaintenanceHistory;$('#clearHistoryBtn').onclick=()=>{if(denyConsultation())return;if(confirm('Limpar todo o histórico?')){state.history=[];save();renderHistory();renderDashboard()}};
    $('#saveSettingsBtn').onclick=()=>{if(denyConsultation())return;state.settings.company=$('#cfgCompany').value.trim()||'XCMG';state.settings.title=$('#cfgTitle').value.trim()||'STATUS XCMG MINA';state.settings.fuelLimit=Math.max(0,Math.min(100,Number($('#cfgFuelLimit').value)||30));save();renderDashboard();toast('Configurações salvas')};
    $('#exportBtn').onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`xcmg-report-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href)};
    $('#importInput').onchange=async e=>{if(denyConsultation())return;try{const data=JSON.parse(await e.target.files[0].text());if(!data.equipments)throw Error();state=data;state.equipments=state.equipments.map(migrateEquipment);save();applyTheme();loadSettingsForm();renderDashboard();renderEquipments();renderHistory();toast('Backup importado')}catch{alert('Arquivo de backup inválido.')}};
    $('#resetBtn').onclick=()=>{if(denyConsultation())return;if(confirm('Restaurar todos os dados iniciais?')){state=clone(initial);save();applyTheme();loadSettingsForm();renderDashboard();renderEquipments();renderHistory();toast('Dados restaurados')}};
  }
  async function init(){
    window.addEventListener('beforeunload',event=>{flushAutoTurnSave();if(hasPendingEquipmentChanges()){event.preventDefault();event.returnValue='';}});
    window.addEventListener('online',()=>setTimeout(flushOfflineQueue,700));
    let autoFlushRunning=false;
    window.addEventListener('xcmg-sync-status',event=>{
      const d=event.detail||{};
      if(!d.online||d.checking||d.syncing||Number(d.pending||0)<1||autoFlushRunning)return;
      autoFlushRunning=true;
      setTimeout(()=>Promise.resolve(flushOfflineQueue()).finally(()=>{autoFlushRunning=false}),400);
    });
    setupSelects();
    bind();
    window.XCMGInitialStatus?.init?.();
    $('#reportDate').value=new Date().toISOString().slice(0,10);
    setInterval(()=>{if(currentUser)loadMessages().then(()=>{if($('#page-recados')?.classList.contains('active'))renderMessages()})},60000);
    setInterval(()=>$('#clock').textContent=new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'medium'}).format(new Date()),1000);
    await window.XCMGOfflineSync?.checkConnection?.();
    // Envia pendências locais antes de puxar o remoto, para não perder alterações offline.
    await flushOfflineQueue();
    await hydrateRemoteCache();
    loadMaintenanceHistory();
    loadMessagesLocal();
    await loadAuth();
    if(currentUser)startSession();
    else{$('.app-shell').classList.add('hidden');$('#loginScreen').classList.remove('hidden')}
    // Registro do Service Worker fica centralizado em js/pwa.js.
    setTimeout(flushOfflineQueue,1200);
  }
  init();
})();
