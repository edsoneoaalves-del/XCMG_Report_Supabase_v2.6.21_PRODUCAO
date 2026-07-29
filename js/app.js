(() => {
  'use strict';
  const LEGACY_KEY='xcmg_report_v1';
  const AUTH_KEY='xcmg_report_auth_v1';
  const TURN_KEY='xcmg_report_last_turn_v1';
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
    const keys=[AUTH_KEY,TURN_KEY];
    for(const key of keys){const value=await remoteGet(key);if(value!==null)localStorage.setItem(key,JSON.stringify(value))}
    let cachedAuth=null;try{cachedAuth=JSON.parse(localStorage.getItem(AUTH_KEY))}catch{}
    for(const user of cachedAuth?.users||[]){const key=USER_KEY(user.id),value=await remoteGet(key);if(value!==null)localStorage.setItem(key,JSON.stringify(value))}
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
  const initial={
    settings:{company:'XCMG',title:'STATUS XCMG MINA',fuelLimit:30,theme:'dark'},
    reportDefaults:{team:'',supervisor:'',programmer:'',safety:'',rigger:''},
    equipments:[],history:[],reports:[]
  };
  let state=clone(initial);
  let auth={users:[],currentUserId:null};
  let currentUser=null;
  let autoTurnEnabled=false;
  let autoTurnTimer=null;
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
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
  async function hashPassword(value){
    const data=new TextEncoder().encode(String(value));
    const hash=await crypto.subtle.digest('SHA-256',data);
    return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  async function loadAuth(){
    try{auth=JSON.parse(localStorage.getItem(AUTH_KEY))||{users:[],currentUserId:null}}catch{auth={users:[],currentUserId:null}}
    if(!Array.isArray(auth.users)||!auth.users.length){
      auth={users:[{id:crypto.randomUUID(),name:'Edson Alves',team:'Turma D',username:'edson',passwordHash:await hashPassword('1234'),role:'admin',createdAt:new Date().toISOString()}],currentUserId:null};
      localStorage.setItem(AUTH_KEY,JSON.stringify(auth));
    }
    // Segurança: nunca restaurar sessão automaticamente após recarregar ou reabrir o sistema.
    // O usuário sempre deverá informar usuário e senha para iniciar uma nova sessão.
    auth.currentUserId=null;
    localStorage.setItem(AUTH_KEY,JSON.stringify(auth));
    remoteSet(AUTH_KEY,auth);
    currentUser=null;
  }
  function saveAuth(){localStorage.setItem(AUTH_KEY,JSON.stringify(auth));remoteSet(AUTH_KEY,auth)}

  function migrateEquipment(x){
    return {
      ...x,
      id:x.id||crypto.randomUUID(),
      category:legacyCategory[x.category]||x.category||CATEGORIES[0],
      status:legacyStatus[x.status]||x.status||STATUSES[0],
      client:String(x.client||'').trim()||DEFAULT_CLIENTS[String(x.prefix||'').trim().toUpperCase()]||'',
      loadStatus:x.loadStatus||'',
      substitute:x.substitute||'',
      condition:x.condition||'',
      notes:x.notes||'',
      updatedAt:x.updatedAt||new Date().toISOString(),
      updateControl:x.updateControl==='updated'?'updated':'pending'
    };
  }
  function save(){
    if(!currentUser)return;
    localStorage.setItem(USER_KEY(currentUser.id),JSON.stringify(state));
    remoteSet(USER_KEY(currentUser.id),state);
    scheduleAutoTurnSave();
  }
  function scheduleAutoTurnSave(delay=500){
    if(!autoTurnEnabled||!currentUser)return;
    clearTimeout(autoTurnTimer);
    autoTurnTimer=setTimeout(()=>saveTurnSnapshot('automatic'),delay);
  }
  function flushAutoTurnSave(){
    if(!autoTurnEnabled||!currentUser)return;
    clearTimeout(autoTurnTimer);
    saveTurnSnapshot('automatic');
  }
  function getLastTurn(){try{return JSON.parse(localStorage.getItem(TURN_KEY))}catch{return null}}
  function saveTurnSnapshot(source='manual'){
    if(!currentUser)return;
    const snapshot={
      id:crypto.randomUUID(),
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
  function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2400)}
  function log(action,detail){state.history.unshift({id:crypto.randomUUID(),action,detail,date:new Date().toISOString()});state.history=state.history.slice(0,500)}
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
  const pageInfo={dashboard:['Dashboard','Visão geral da operação'],equipamentos:['Equipamentos','Cadastro e atualização da frota'],relatorios:['Relatórios','Geração automática para WhatsApp'],historico:['Histórico','Rastreabilidade das alterações'],usuarios:['Usuários','Cadastro exclusivo do administrador'],configuracoes:['Configurações','Preferências e segurança dos dados']};
  function go(page){$$('.page').forEach(x=>x.classList.remove('active'));$(`#page-${page}`).classList.add('active');$$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.page===page));$('#pageTitle').textContent=pageInfo[page][0];$('#pageSubtitle').textContent=pageInfo[page][1];$('#sidebar').classList.remove('open');if(page==='dashboard')renderDashboard();if(page==='equipamentos')renderEquipments();if(page==='historico')renderHistory();if(page==='relatorios')generateReport();if(page==='usuarios')renderUsers()}
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
      items.set(key,{prefix:key,capacity:x.capacity||'',status:x.status,location:x.location||'',replacedBy:[]});
    });
    state.equipments.forEach(x=>{
      const sub=parseEquipmentLabel(x.substitute);
      if(!sub.prefix)return;
      const key=sub.prefix.trim().toUpperCase();
      if(sealPrefixes.has(key))return;
      const current=items.get(key)||{prefix:key,capacity:sub.capacity||'',status:'Substituído',location:'',replacedBy:[]};
      current.capacity=current.capacity||sub.capacity||'';
      const replacement=equipmentLabel(x.prefix,x.capacity);
      if(replacement&&!current.replacedBy.includes(replacement))current.replacedBy.push(replacement);
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
      const detail=hasReplacement
        ? `Substituído por <b>${esc(x.replacedBy.join(', '))}</b>`
        : esc(x.location||'Sem localização informada');
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
  function renderEquipments(){
    const q=$('#searchInput').value.trim().toLowerCase(),cat=$('#filterCategory').value,st=$('#filterStatus').value;
    const list=state.equipments.filter(x=>(!q||[x.prefix,x.category,x.location,x.capacity,x.client,x.condition,x.notes,x.substitute].join(' ').toLowerCase().includes(q))&&(!cat||x.category===cat)&&(!st||x.status===st));
    const statusGroup=x=>['Preventiva','Corretiva'].includes(x.status)?'maintenance':x.status;
    const statusButtons=x=>{
      const current=statusGroup(x);
      const buttons=[
        ['Disponível','🟢','Disponível'],
        ['Em atendimento','🔵','Em atendimento'],
        ['maintenance','🔴',x.status==='Corretiva'?'Corretiva':'Manutenção'],
        ['Renovação do selo (Vale)','🟡','Renovação do selo']
      ];
      return `<div class="status-buttons" data-field="status" data-id="${x.id}" data-value="${esc(x.status)}">${buttons.map(([value,emoji,label])=>`<button type="button" class="status-dot ${current===value?'active':''}" data-status-choice="${esc(value)}" title="${esc(label)}" aria-label="${esc(label)}">${emoji}</button>`).join('')}</div>`;
    };
    $('#equipmentGrid').innerHTML=`<div class="equipment-table-wrap"><table class="equipment-table"><thead><tr><th>Equipamento</th><th>Status</th><th>Cliente</th><th>Localização</th><th>Condição / posicionamento</th><th>Combustível</th><th class="substitute-col">Substitui</th><th>Controle</th><th>Ações</th></tr></thead><tbody>${list.map(x=>`<tr style="--status-color:${statusColor[x.status]||'#1d8cff'}" data-equipment-row="${x.id}"><td data-label="Equipamento" class="equipment-id-cell"><strong>${esc(x.prefix)}</strong>${x.capacity?`<small>${esc(x.capacity)}</small>`:''}</td><td data-label="Status">${statusButtons(x)}</td><td data-label="Cliente"><input class="quick-field client-quick-field" data-field="client" data-id="${x.id}" value="${esc(x.client||DEFAULT_CLIENTS[String(x.prefix||'').trim().toUpperCase()]||'')}" list="clientOptions" placeholder="Cliente"></td><td data-label="Localização"><input class="quick-field" data-field="location" data-id="${x.id}" value="${esc(x.location||'')}" list="locationOptions"></td><td data-label="Condição / posicionamento"><input class="quick-field" data-field="condition" data-id="${x.id}" value="${esc([x.loadStatus,x.condition].filter(Boolean).join(', '))}" placeholder="Patolado, estacionado..."></td><td data-label="Combustível"><div class="fuel-edit"><input type="number" min="0" max="100" class="quick-field" data-field="fuel" data-id="${x.id}" value="${Number(x.fuel)||0}"><span>%</span></div></td><td data-label="Substitui" class="substitute-cell"><input class="quick-field substitute-quick-field" data-field="substitute" data-id="${x.id}" value="${esc(x.substitute||'')}" list="substituteOptions" placeholder="—"></td><td data-label="Conferência" class="control-cell"><button type="button" class="update-control ${x.updateControl==='updated'?'is-updated':'is-pending'}" data-update-control="${x.id}" title="Controle interno de conferência">${x.updateControl==='updated'?'✅ Conferido':'⚠️ Pendente'}</button></td><td data-label="Ações" class="row-actions"><button class="btn small primary" data-quick-save="${x.id}">Salvar</button><button class="btn small" data-edit="${x.id}">Detalhes</button><button class="icon-delete" title="Excluir" data-delete="${x.id}">×</button></td></tr>`).join('')}</tbody></table></div>`;
    $('#equipmentEmpty').classList.toggle('hidden',list.length>0);
  }
  function quickSaveEquipment(id){
    const x=state.equipments.find(e=>e.id===id);if(!x)return;
    const row=document.querySelector(`[data-quick-save="${id}"]`)?.closest('tr');if(!row)return;
    const value=field=>{const el=row.querySelector(`[data-field="${field}"]`);return el?.dataset?.value??el?.value??'';};
    const condition=value('condition').trim();
    const substitute=parseEquipmentLabel(value('substitute'));
    x.status=value('status')||x.status;x.client=value('client').trim();x.location=value('location').trim();x.condition=condition;x.loadStatus='';
    x.fuel=Math.max(0,Math.min(100,Number(value('fuel'))||0));
    x.substitute=substitute.prefix?equipmentLabel(substitute.prefix,substitute.capacity):'';
    x.updatedAt=new Date().toISOString();
    log('Equipamento atualizado',`${x.prefix} — ${x.status} em ${x.location}`);save();renderPrefixOptions();renderEquipments();renderDashboard();toast(`${x.prefix} atualizado com sucesso`);
  }
  function toggleUpdateControl(id){
    const x=state.equipments.find(e=>e.id===id);if(!x)return;
    x.updateControl=x.updateControl==='updated'?'pending':'updated';
    save();renderEquipments();
    toast(x.updateControl==='updated'?`${x.prefix} marcado como conferido`:`${x.prefix} marcado como pendente`);
  }
  function markRowPending(id){
    const x=state.equipments.find(e=>e.id===id);if(!x||x.updateControl==='pending')return;
    x.updateControl='pending';save();
    const btn=document.querySelector(`[data-update-control="${id}"]`);
    if(btn){btn.classList.remove('is-updated');btn.classList.add('is-pending');btn.textContent='⚠️ Pendente';}
  }
  function updateCategoryFields(){
    const isMunck=$('#eqCategory').value==='GUINDAUTO SKY MUNCK';
    $('#loadStatusField').classList.toggle('hidden',!isMunck);
    if(!isMunck)$('#eqLoadStatus').value='';
  }
  function openModal(id){
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
    updateCategoryFields();
    $('#modalBackdrop').classList.remove('hidden');
  }
  function closeModal(){$('#modalBackdrop').classList.add('hidden');$('#equipmentForm').reset()}
  function submitEquipment(ev){
    ev.preventDefault();
    const id=$('#equipmentId').value,now=new Date().toISOString();
    const selected=parseEquipmentLabel($('#eqPrefix').value);
    selected.prefix=normalizeEquipmentPrefix(selected.prefix);
    const substitute=parseEquipmentLabel($('#eqSubstitute').value);
    const duplicate=state.equipments.find(x=>x.id!==id&&normalizeEquipmentPrefix(x.prefix)===selected.prefix);
    if(duplicate){
      alert(`O equipamento ${selected.prefix} já está cadastrado. Não é permitido cadastrar o mesmo equipamento novamente.`);
      $('#eqPrefix').focus();
      $('#eqPrefix').select();
      return;
    }
    const data={
      id:id||crypto.randomUUID(),prefix:selected.prefix,category:$('#eqCategory').value,
      capacity:($('#eqCapacity').value.trim()||selected.capacity),status:$('#eqStatus').value,client:$('#eqClient').value.trim()||DEFAULT_CLIENTS[selected.prefix]||'',
      location:$('#eqLocation').value.trim(),loadStatus:$('#eqLoadStatus').value,
      substitute:substitute.prefix?equipmentLabel(substitute.prefix,substitute.capacity):'',
      fuel:Number($('#eqFuel').value)||0,condition:$('#eqCondition').value.trim(),notes:$('#eqNotes').value.trim(),updatedAt:now,updateControl:id?(state.equipments.find(x=>x.id===id)?.updateControl||'pending'):'pending'
    };
    if(id){const i=state.equipments.findIndex(x=>x.id===id);state.equipments[i]=data;log('Equipamento atualizado',`${data.prefix} — ${data.status} em ${data.location}`)}
    else{state.equipments.push(data);log('Equipamento cadastrado',`${data.prefix} — ${data.category}`)}
    save();renderPrefixOptions();closeModal();renderEquipments();renderDashboard();toast('Equipamento salvo com sucesso');
  }
  function deleteEquipment(id){const x=state.equipments.find(e=>e.id===id);if(!x||!confirm(`Excluir o equipamento ${x.prefix}?`))return;state.equipments=state.equipments.filter(e=>e.id!==id);log('Equipamento excluído',x.prefix);save();renderPrefixOptions();renderEquipments();renderDashboard();toast('Equipamento excluído')}
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
  function saveReportDefaults(){
    if(!currentUser)return;
    state.reportDefaults={
      team:$('#reportTeam').value.trim(),
      supervisor:$('#reportSupervisor').value.trim(),
      programmer:$('#reportProgrammer').value.trim(),
      safety:$('#reportSafety').value.trim(),
      rigger:$('#reportRigger').value.trim()
    };
    localStorage.setItem(USER_KEY(currentUser.id),JSON.stringify(state));
    remoteSet(USER_KEY(currentUser.id),state);
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
    return out;
  }
  function generateReport(){$('#reportOutput').value=reportText()}
  function saveReport(){generateReport();const text=$('#reportOutput').value;state.reports.unshift({id:crypto.randomUUID(),date:new Date().toISOString(),text});log('Relatório salvo','Relatório salvo com sucesso');save();saveTurnSnapshot('report');renderHistory();toast('Relatório salvo e liberado para o próximo turno')}
  function renderHistory(){const q=$('#historySearch').value.trim().toLowerCase(),list=state.history.filter(x=>!q||`${x.action} ${x.detail}`.toLowerCase().includes(q));$('#historyList').innerHTML=list.map(h=>`<div class="timeline-item"><div class="timeline-date">${fmtDate(h.date)}</div><div><strong>${esc(h.action)}</strong><div class="muted">${esc(h.detail)}</div></div></div>`).join('')||'<div class="empty">Nenhum registro encontrado.</div>'}
  function loadSettingsForm(){$('#cfgCompany').value=state.settings.company;$('#cfgTitle').value=state.settings.title;$('#cfgFuelLimit').value=state.settings.fuelLimit}
  function renderUsers(){
    if(currentUser?.role!=='admin'){go('dashboard');return}
    $('#userList').innerHTML=auth.users.map(u=>{
      const canDelete=u.id!==currentUser.id;
      return `<div class="user-card"><div><strong>${esc(u.name)}</strong><small>@${esc(u.username)}</small></div><span class="user-badge">${esc(u.team)}</span><span class="user-role">${u.role==='admin'?'Administrador':'Usuário'}</span><div class="user-actions"><button class="btn small" data-reset-password="${u.id}">Redefinir senha</button>${canDelete?`<button class="btn small danger" data-delete-user="${u.id}">Excluir usuário</button>`:'<span class="user-self-note">Usuário atual</span>'}</div></div>`;
    }).join('');
  }
  function openUserModal(){if(currentUser?.role!=='admin')return;$('#userForm').reset();$('#userModalBackdrop').classList.remove('hidden');$('#userFullName').focus()}
  function closeUserModal(){$('#userModalBackdrop').classList.add('hidden')}
  async function createUser(e){
    e.preventDefault();if(currentUser?.role!=='admin')return;
    const name=$('#userFullName').value.trim(),team=$('#userTeam').value.trim(),username=$('#newUsername').value.trim().toLowerCase(),password=$('#newUserPassword').value;
    if(auth.users.some(u=>u.username.toLowerCase()===username)){alert('Este nome de usuário já existe.');return}
    const user={id:crypto.randomUUID(),name,team,username,passwordHash:await hashPassword(password),role:'user',createdAt:new Date().toISOString()};
    auth.users.push(user);saveAuth();localStorage.setItem(USER_KEY(user.id),JSON.stringify(clone(initial)));remoteSet(USER_KEY(user.id),clone(initial));closeUserModal();renderUsers();toast('Usuário criado com sucesso');
  }
  async function changeOwnPassword(e){
    e.preventDefault();
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
  async function refreshAuthFromSupabase(){
    try{
      const online=await window.XCMGOfflineSync?.checkConnection?.();
      if(!online||!supabaseClient)return false;
      const remoteAuth=await remoteGet(AUTH_KEY);
      if(!remoteAuth||!Array.isArray(remoteAuth.users)||!remoteAuth.users.length)return false;
      auth={...remoteAuth,currentUserId:null};
      localStorage.setItem(AUTH_KEY,JSON.stringify(auth));
      return true;
    }catch(error){
      console.warn('Não foi possível atualizar os usuários antes do login.',error);
      return false;
    }
  }
  async function login(e){
    e.preventDefault();
    const username=$('#loginUsername').value.trim().toLowerCase();
    const passwordHash=await hashPassword($('#loginPassword').value);
    let user=auth.users.find(u=>u.username.toLowerCase()===username&&u.passwordHash===passwordHash);
    // No PWA instalado, o armazenamento é separado do navegador. Se o acesso não
    // estiver no cache local, buscamos novamente a lista oficial no Supabase.
    if(!user){
      const refreshed=await refreshAuthFromSupabase();
      if(refreshed)user=auth.users.find(u=>u.username.toLowerCase()===username&&u.passwordHash===passwordHash);
    }
    if(!user){alert('Usuário ou senha inválidos.');return}
    // A sessão fica apenas em memória e termina ao atualizar/fechar a página.
    currentUser=user;startSession();
  }
  function logout(){flushAutoTurnSave();auth.currentUserId=null;saveAuth();currentUser=null;location.reload()}
  function startSession(){
    state=loadUserState(currentUser.id);$('#loginScreen').classList.add('hidden');$('.app-shell').classList.remove('hidden');
    $('#currentUserName').textContent=currentUser.name;$('#currentUserTeam').textContent=currentUser.team;
    $$('.admin-only').forEach(el=>el.classList.toggle('hidden',currentUser.role!=='admin'));
    loadReportDefaults();
    applyTheme();loadSettingsForm();renderDashboard();renderEquipments();renderHistory();generateReport();
    localStorage.setItem(USER_KEY(currentUser.id),JSON.stringify(state));
    remoteSet(USER_KEY(currentUser.id),state);
    const last=getLastTurn();
    if(last&&last.userId!==currentUser.id&&Array.isArray(last.equipments)&&last.equipments.length){
      applyLastTurn(last);
    }
    autoTurnEnabled=true;
  }
  function bind(){
    $('#loginForm').onsubmit=login;$('#logoutBtn').onclick=logout;$('#newUserBtn').onclick=openUserModal;$('#closeUserModalBtn').onclick=closeUserModal;$('#cancelUserModalBtn').onclick=closeUserModal;$('#userForm').onsubmit=createUser;$('#userModalBackdrop').onclick=e=>{if(e.target.id==='userModalBackdrop')closeUserModal()};$('#changePasswordForm').onsubmit=changeOwnPassword;$('#resetPasswordForm').onsubmit=resetUserPassword;$('#closeResetPasswordModalBtn').onclick=closeResetPasswordModal;$('#cancelResetPasswordBtn').onclick=closeResetPasswordModal;$('#resetPasswordModalBackdrop').onclick=e=>{if(e.target.id==='resetPasswordModalBackdrop')closeResetPasswordModal()};
    $('#nav').addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b)go(b.dataset.page)});
    document.addEventListener('click',e=>{const g=e.target.closest('[data-go]');if(g)go(g.dataset.go);const ed=e.target.closest('[data-edit]');if(ed)openModal(ed.dataset.edit);const del=e.target.closest('[data-delete]');if(del)deleteEquipment(del.dataset.delete);const control=e.target.closest('[data-update-control]');if(control)toggleUpdateControl(control.dataset.updateControl);const choice=e.target.closest('[data-status-choice]');if(choice){const group=choice.closest('[data-field="status"]');if(group){let selected=choice.dataset.statusChoice;if(selected==='maintenance'){const current=group.dataset.value;selected=['Preventiva','Corretiva'].includes(current)?current:'Preventiva';}group.dataset.value=selected;group.querySelectorAll('.status-dot').forEach(btn=>btn.classList.toggle('active',btn===choice));const row=group.closest('tr');if(row)row.style.setProperty('--status-color',statusColor[selected]||'#1d8cff');}}const qs=e.target.closest('[data-quick-save]');if(qs)quickSaveEquipment(qs.dataset.quickSave);const rp=e.target.closest('[data-reset-password]');if(rp)openResetPasswordModal(rp.dataset.resetPassword);const du=e.target.closest('[data-delete-user]');if(du)deleteUser(du.dataset.deleteUser)});
    $('#equipmentGrid').addEventListener('input',()=>{});
    $('#menuBtn').onclick=()=>$('#sidebar').classList.toggle('open');
    $('#themeBtn').onclick=()=>{state.settings.theme=state.settings.theme==='light'?'dark':'light';save();applyTheme()};
    $('#newEquipmentBtn').onclick=()=>openModal();$('#closeModalBtn').onclick=closeModal;$('#cancelModalBtn').onclick=closeModal;
    $('#modalBackdrop').onclick=e=>{if(e.target.id==='modalBackdrop')closeModal()};
    $('#equipmentForm').onsubmit=submitEquipment;$('#eqCategory').onchange=updateCategoryFields;
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
    $('#historySearch').oninput=renderHistory;$('#clearHistoryBtn').onclick=()=>{if(confirm('Limpar todo o histórico?')){state.history=[];save();renderHistory();renderDashboard()}};
    $('#saveSettingsBtn').onclick=()=>{state.settings.company=$('#cfgCompany').value.trim()||'XCMG';state.settings.title=$('#cfgTitle').value.trim()||'STATUS XCMG MINA';state.settings.fuelLimit=Math.max(0,Math.min(100,Number($('#cfgFuelLimit').value)||30));save();renderDashboard();toast('Configurações salvas')};
    $('#exportBtn').onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`xcmg-report-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href)};
    $('#importInput').onchange=async e=>{try{const data=JSON.parse(await e.target.files[0].text());if(!data.equipments)throw Error();state=data;state.equipments=state.equipments.map(migrateEquipment);save();applyTheme();loadSettingsForm();renderDashboard();renderEquipments();renderHistory();toast('Backup importado')}catch{alert('Arquivo de backup inválido.')}};
    $('#resetBtn').onclick=()=>{if(confirm('Restaurar todos os dados iniciais?')){state=clone(initial);save();applyTheme();loadSettingsForm();renderDashboard();renderEquipments();renderHistory();toast('Dados restaurados')}};
  }
  async function init(){window.addEventListener('beforeunload',flushAutoTurnSave);window.addEventListener('online',()=>setTimeout(flushOfflineQueue,700));let autoFlushRunning=false;window.addEventListener('xcmg-sync-status',event=>{const d=event.detail||{};if(!d.online||d.checking||d.syncing||Number(d.pending||0)<1||autoFlushRunning)return;autoFlushRunning=true;setTimeout(()=>Promise.resolve(flushOfflineQueue()).finally(()=>{autoFlushRunning=false}),400)});setupSelects();bind();$('#reportDate').value=new Date().toISOString().slice(0,10);setInterval(()=>$('#clock').textContent=new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'medium'}).format(new Date()),1000);await window.XCMGOfflineSync?.checkConnection?.();await hydrateRemoteCache();await loadAuth();if(currentUser)startSession();else{$('.app-shell').classList.add('hidden');$('#loginScreen').classList.remove('hidden')}if('serviceWorker'in navigator)navigator.serviceWorker.register('service-worker.js').catch(()=>{});setTimeout(flushOfflineQueue,1200)}
  init();
})();
