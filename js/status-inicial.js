(() => {
  'use strict';
  const STORAGE_KEY='xcmg_report_initial_status_v1';
  const STATUS_CONFIG_KEY='xcmg_report_effective_status_config_v1';
  const cloud=()=>window.XCMGCloudStorage;
  let dirty=false;
  let lastRemoteStamp='';
  let cloudPullRunning=false;
  async function persistCloud(key,value){
    localStorage.setItem(key,JSON.stringify(value));
    dirty=false;
    try{
      const ok=await cloud()?.set?.(key,value);
      if(ok===false)throw new Error('Supabase não confirmou a gravação.');
      const record=await cloud()?.getRecord?.(key);
      if(record?.updatedAt)lastRemoteStamp=record.updatedAt;
      return true;
    }catch(error){
      console.error('Falha ao sincronizar Status do Efetivo:',error);
      toast('Salvo neste aparelho. Aguardando sincronização com os demais dispositivos.');
      return false;
    }
  }
  async function pullCloud(force=false){
    if(cloudPullRunning||!cloud()?.getRecord)return false;
    if(dirty&&!force)return false;
    cloudPullRunning=true;
    try{
      let changed=false;
      for(const key of [STORAGE_KEY,STATUS_CONFIG_KEY]){
        const record=await cloud().getRecord(key);
        if(!record||record.value===null||record.value===undefined)continue;
        const localRaw=localStorage.getItem(key);
        const remoteRaw=JSON.stringify(record.value);
        if(localRaw!==remoteRaw){
          localStorage.setItem(key,remoteRaw);
          changed=true;
        }
        if(record.updatedAt)lastRemoteStamp=record.updatedAt;
      }
      if(changed){reloadFromStorage();return true;}
      return false;
    }catch(error){console.warn('Falha ao buscar Status do Efetivo no Supabase:',error);return false}
    finally{cloudPullRunning=false}
  }
  const DEFAULT_STATUS_CONFIG=[
    {key:'green',emoji:'🟢',label:'Com operador / com sinaleiro'},
    {key:'orange',emoji:'🟠',label:'Sem operador / sem sinaleiro'},
    {key:'yellow',emoji:'🟡',label:'Atualização de Selo (Vale)'},
    {key:'red',emoji:'🔴',label:'Manutenção corretiva/preventiva'}
  ];
  let statusConfig=[];
  function loadStatusConfig(){
    try{statusConfig=JSON.parse(localStorage.getItem(STATUS_CONFIG_KEY))}catch{}
    if(!Array.isArray(statusConfig)||!statusConfig.length)statusConfig=DEFAULT_STATUS_CONFIG.map(x=>({...x}));
    const byKey=new Map(statusConfig.map(x=>[x.key,x]));
    statusConfig=DEFAULT_STATUS_CONFIG.map(def=>({...def,...(byKey.get(def.key)||{})}));
  }
  function statusDef(key){return statusConfig.find(x=>x.key===key)||DEFAULT_STATUS_CONFIG.find(x=>x.key===key)||{key,emoji:'',label:key}}
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid=()=>crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const weekday=date=>new Intl.DateTimeFormat('pt-BR',{weekday:'long'}).format(new Date(`${date}T12:00:00`)).toUpperCase();
  const today=()=>new Date().toISOString().slice(0,10);
  const toast=msg=>{const t=$('#toast');if(!t)return;t.textContent=msg;t.classList.add('show');clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove('show'),2600)};
  function normalizeEquipmentLabel(value=''){
    return String(value||'').trim().replace(/\s+/g,' ').toUpperCase();
  }
  function splitLegacySubstitute(value=''){
    const raw=normalizeEquipmentLabel(value);
    const match=raw.match(/^(.*?)\s+SUB\.?\s+(.+)$/i);
    return match?{prefix:match[1].trim(),substitute:match[2].trim()}:{prefix:raw,substitute:''};
  }
  function equipmentLabel(prefix='',capacity=''){
    const raw=normalizeEquipmentLabel(prefix);
    const cap=String(capacity||'').trim();
    if(!cap||new RegExp(`\\s${cap.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`,'i').test(raw))return raw;
    return [raw,cap].filter(Boolean).join(' ');
  }
  function parseEquipment(value=''){
    return {prefix:normalizeEquipmentLabel(value),capacity:''};
  }
  const item=(status='green',prefix='',capacity='',location='',operator='',signalman='',notes='',operatorStatus='',signalmanStatus='',substitute='')=>{
    const genericSignal=/^(COM|SEM)\s+SINALEIRO$/i.test(String(signalman).trim());
    const resolvedSignalStatus=signalmanStatus||(status==='red'?'none':/^COM/i.test(signalman)?'with':/^SEM/i.test(signalman)?'without':signalman?'with':'none');
    const legacy=splitLegacySubstitute(prefix);
    return {id:uid(),status,prefix:equipmentLabel(legacy.prefix,capacity),capacity:'',substitute:normalizeEquipmentLabel(substitute||legacy.substitute),location,operator,signalman:genericSignal?'':signalman,notes,control:'pending',
      operatorStatus:operatorStatus||(status==='red'?'none':operator?'with':'without'),signalmanStatus:resolvedSignalStatus};
  };
  const defaults=()=>({
    title:'Status XCMG MINA',date:today(),team:'TURNO D',weekday:weekday(today()),
    categories:[
      {id:uid(),name:'Status dos Guindastes',items:[item('green','1JA230','70t','PÁTIO DE REFORMAS','CÁSSIO','COM SINALEIRO',''),item('green','1JA218','250t','OVERLAND','ALDO','COM SINALEIRO',''),item('red','1JA241','250t','','','','PREVENTIVA'),item('green','1JA221','110t','SISTEMA 2','GLEDSON','COM SINALEIRO',''),item('green','1JA226','110t','TR1082KS011','VENILSON','COM SINALEIRO','')]},
      {id:uid(),name:'Status das Carretas – Mina',items:[item('green','1JA350','','','LUIZ','',''),item('green','1JA268','','','PAULO','','')]},
      {id:uid(),name:'Status dos Caminhões – Mina / Turno',items:[item('green','1JA343','','GPA / TRUCKLESS','DENILSON','',''),item('green','1JA347','','ESCAVAÇÃO','SILVE','',''),item('green','1JA537','','SOTREQ','DORIEL','',''),item('green','1JA410','','PERFURAÇÃO','RENATO','',''),item('green','1JA377','','VULCANIZAÇÃO','EDSON','',''),item('green','1JA360','','ELÉTRICA','JOZELINO','',''),item('green','1JA378','','POOL','LAUDENIR','',''),item('green','1JA406 SUB. 1JA339','','POOL','ONIAS','','CARREGADO COM MATERIAL DA TRUCKLESS'),item('green','1JA405 SUB. 1JA342','','POOL','WELLINGTON','','CARREGADO COM MATERIAIS'),item('green','1JA340 SUB. 1JA536','','POOL','JOSIVALDO','','RECURSOS'),item('green','1JA348','','POOL / ESCAVAÇÃO','NEXVALDO','','')]},
      {id:uid(),name:'Guindauto Sky Munck',items:[item('green','1JA416','','OPERAÇÃO VALE','','','')]},
      {id:uid(),name:'Status das Empilhadeiras',items:[item('green','1JA369','16t','','','','SEM INFORMAÇÕES'),item('green','1JA373','16t','OFICINA MÓVEIS','MÁRCIO','',''),item('green','1JA371','16t','OFICINA DE PNEUS','OPERAÇÃO VALE','',''),item('red','1JA374','7t','','','','EM MANUTENÇÃO'),item('green','1JA375','10t','SISTEMA 02','KEMUEL','',''),item('green','1JA376','10t','PÁTIO 14','GILMARLYS','','')]}
    ]
  });
  let data=null;
  const filterState={search:'',category:'',status:''};
  function migrate(){
    const migrateLegacyYellow=data.effectiveStatusSchema!==2;
    data.categories.forEach(c=>c.items=(c.items||[]).map(x=>{
      const rawSignal=String(x.signalman||'').trim();
      const genericSignal=/^(COM|SEM)\s+SINALEIRO$/i.test(rawSignal);
      const legacy=splitLegacySubstitute(x.prefix||'');
      return {...x,status:migrateLegacyYellow&&x.status==='yellow'?'orange':x.status,id:x.id||uid(),prefix:equipmentLabel(legacy.prefix,x.capacity),capacity:'',substitute:normalizeEquipmentLabel(x.substitute||legacy.substitute),
        operatorStatus:x.operatorStatus||(x.status==='red'?'none':x.operator?'with':'without'),
        signalmanStatus:x.signalmanStatus||(x.status==='red'?'none':/^COM/i.test(rawSignal)?'with':/^SEM/i.test(rawSignal)?'without':rawSignal?'with':'none'),
        signalman:genericSignal?'':rawSignal,control:x.control==='checked'?'checked':'pending'};
    }));
    data.effectiveStatusSchema=2;
  }
  function load(){loadStatusConfig();try{data=JSON.parse(localStorage.getItem(STORAGE_KEY))}catch{}if(!data||!Array.isArray(data.categories))data=defaults();migrate()}
  function capture(){
    data.title=$('#initialTitle').value.trim()||'Status XCMG MINA';
    data.date=$('#initialDate').value||today();
    data.team=$('#initialTeam').value.trim();
    data.weekday=$('#initialWeekday').value.trim();
    const categories=data.categories.map(c=>({...c,items:[]}));
    const byId=new Map(categories.map(c=>[c.id,c]));
    document.querySelectorAll('.initial-item').forEach(row=>{
      const equipment=parseEquipment(row.querySelector('[data-field="equipment"]').value);
      const categoryId=row.dataset.categoryId||categories[0]?.id;
      const category=byId.get(categoryId)||categories[0];
      if(!category)return;
      category.items.push({
        id:row.dataset.id,status:row.querySelector('[data-field="status"]').value,
        prefix:equipment.prefix,capacity:'',
        substitute:row.querySelector('[data-field="substitute"]')?.value.trim().toUpperCase()||'',
        location:row.querySelector('[data-field="location"]').value.trim(),
        operatorStatus:row.querySelector('[data-field="operatorStatus"]').value,
        operator:row.querySelector('[data-field="operator"]').value.trim(),
        signalmanStatus:row.querySelector('[data-field="signalmanStatus"]').value,
        signalman:row.querySelector('[data-field="signalman"]').value.trim(),
        notes:row.querySelector('[data-field="notes"]').value.trim(),
        control:row.dataset.control==='checked'?'checked':'pending'
      });
    });
    data.categories=categories;
  }
  function statusOptions(selected){return statusConfig.map(x=>`<option value="${esc(x.key)}" ${x.key===selected?'selected':''}>${esc(x.emoji)}</option>`).join('')}
  function personStatusOptions(selected,type){
    const noun=type==='operator'?'OPERADOR':'SINALEIRO';
    return [['with',`${statusDef('green').emoji} COM ${noun}`],['without',`${statusDef('orange').emoji} SEM ${noun}`],['none','— NÃO SE APLICA']].map(([v,l])=>`<option value="${v}" ${v===selected?'selected':''}>${l}</option>`).join('');
  }
  function controlLabel(control){return control==='checked'?'✓ Conferido':'⚠ Pendente'}
  function equipmentSortKey(value=''){
    const label=normalizeEquipmentLabel(value);
    const prefixMatch=label.match(/([A-Z]+)?\s*(\d+)/i);
    const prefixText=prefixMatch?.[1]||'';
    const prefixNumber=prefixMatch?Number(prefixMatch[2]):Number.MAX_SAFE_INTEGER;
    const capacityMatch=label.match(/(\d+(?:[.,]\d+)?)\s*T/i);
    const capacity=capacityMatch?Number(capacityMatch[1].replace(',','.')):Number.MAX_SAFE_INTEGER;
    return {prefixText,prefixNumber,capacity,label};
  }
  function compareEquipmentAscending(a,b){
    const ka=equipmentSortKey(a?.prefix||'');
    const kb=equipmentSortKey(b?.prefix||'');
    return ka.prefixText.localeCompare(kb.prefixText,'pt-BR',{sensitivity:'base'})
      || ka.prefixNumber-kb.prefixNumber
      || ka.capacity-kb.capacity
      || ka.label.localeCompare(kb.label,'pt-BR',{numeric:true,sensitivity:'base'});
  }
  function sortItemsByCategory(){
    data.categories.forEach(category=>{
      category.items=(category.items||[]).slice().sort(compareEquipmentAscending);
    });
  }
  function itemHtml(x,categoryId){const control=x.control==='checked'?'checked':'pending';const savedEquipment=equipmentLabel(x.prefix,x.capacity);return `<tr class="initial-item" data-id="${esc(x.id)}" data-category-id="${esc(categoryId)}" data-equipment="${esc(savedEquipment)}" data-substitute="${esc(x.substitute||'')}" data-control="${control}">
    <td data-label="Status" class="initial-status-cell"><div class="initial-status-control" data-status="${esc(x.status)}"><span class="initial-status-indicator" aria-hidden="true"></span><select class="initial-status-select" data-field="status" aria-label="Status do equipamento">${statusOptions(x.status)}</select></div></td>
    <td data-label="Equipamento" class="initial-equipment-combined"><input type="hidden" data-field="equipment" value="${esc(equipmentLabel(x.prefix,x.capacity))}"><div class="initial-equipment-saved"><strong>${esc(equipmentLabel(x.prefix,x.capacity)||'Sem equipamento')}</strong></div></td>
    <td data-label="Substitui" class="initial-substitute-field"><input data-field="substitute" value="${esc(x.substitute||'')}" placeholder="—"></td>
    <td data-label="Status operador" class="initial-person-status"><select data-field="operatorStatus" aria-label="Status do operador">${personStatusOptions(x.operatorStatus,'operator')}</select></td>
    <td data-label="Operador" class="initial-person-name"><input data-field="operator" value="${esc(x.operator)}" placeholder="Operador" ${x.operatorStatus!=='with'?'disabled':''}></td>
    <td data-label="Status sinaleiro" class="initial-person-status"><select data-field="signalmanStatus" aria-label="Status do sinaleiro">${personStatusOptions(x.signalmanStatus,'signalman')}</select></td>
    <td data-label="Sinaleiro" class="initial-person-name"><input data-field="signalman" value="${esc(x.signalman)}" placeholder="Sinaleiro" ${x.signalmanStatus!=='with'?'disabled':''}></td>
    <td data-label="Local / Área" class="initial-location-field"><input data-field="location" value="${esc(x.location)}" placeholder="Local / Área"></td>
    <td data-label="Observação" class="initial-notes-field"><input class="initial-notes-input" type="text" data-field="notes" value="${esc(x.notes)}" placeholder="Observação" aria-label="Observação do equipamento"></td>
    <td data-label="Controle" class="initial-control-cell"><button class="initial-control-btn ${control}" type="button" data-control-toggle aria-label="Controle interno de conferência">${controlLabel(control)}</button></td>
    <td data-label="Ações" class="initial-row-actions"><button class="btn small primary initial-row-save" type="button" data-save-row title="Salvar e marcar como conferido">Salvar</button><button class="btn small" type="button" data-edit-equipment data-edit-id="${esc(x.id)}" title="Editar equipamento">Detalhes</button><button class="icon-delete initial-remove-item" type="button" data-remove-item title="Remover equipamento" aria-label="Remover equipamento">×</button></td>
  </tr>`}
  function unifiedTableHtml(){
    const rows=data.categories.flatMap(c=>(c.items||[]).map(x=>itemHtml(x,c.id))).join('');
    return `<article class="panel initial-unified-panel"><div class="equipment-table-wrap initial-table-wrap"><table class="equipment-table initial-equipment-table initial-unified-table"><thead><tr><th>Status</th><th>Equipamento</th><th>Substitui</th><th>Status operador</th><th>Operador</th><th>Status sinaleiro</th><th>Sinaleiro</th><th>Local / Área</th><th>Observação</th><th>Controle</th><th>Ações</th></tr></thead><tbody class="initial-items">${rows||'<tr><td colspan="11"><div class="initial-empty">Nenhum equipamento cadastrado.</div></td></tr>'}</tbody></table></div></article>`;
  }
  function refreshFilterOptions(){
    const select=$('#initialFilterCategory');
    if(!select)return;
    const current=filterState.category;
    select.innerHTML='<option value="">Todas as categorias</option>'+data.categories.map(c=>`<option value="${esc(c.id)}">${esc(c.name||'Categoria sem nome')}</option>`).join('');
    if(data.categories.some(c=>c.id===current))select.value=current;else{filterState.category='';select.value=''}
  }
  function rowSearchText(row,categoryName=''){
    return [categoryName,...row.querySelectorAll('input,select')].map(value=>{
      if(typeof value==='string')return value;
      if(value.tagName==='SELECT')return `${value.value} ${value.options[value.selectedIndex]?.text||''}`;
      return value.value||'';
    }).join(' ').toLocaleLowerCase('pt-BR');
  }
  function rowMatchesStatus(row,status){
    if(!status)return true;
    if(status==='checked'||status==='pending')return row.dataset.control===status;
    return row.querySelector('[data-field="status"]')?.value===status;
  }
  function readFilterControls(){
    const searchInput=$('#initialSearchInput');
    const categorySelect=$('#initialFilterCategory');
    const statusSelect=$('#initialFilterStatus');
    filterState.search=String(searchInput?.value||'');
    filterState.category=String(categorySelect?.value||'');
    filterState.status=String(statusSelect?.value||'');
  }
  function setRowVisibility(row,visible){
    row.hidden=!visible;
    row.classList.toggle('initial-filter-hidden',!visible);
    if(visible)row.style.removeProperty('display');
    else row.style.setProperty('display','none','important');
  }
  function applyFilters(){
    readFilterControls();
    const search=filterState.search.trim().toLocaleLowerCase('pt-BR');
    const selectedCategory=String(filterState.category||'');
    const selectedStatus=String(filterState.status||'');
    document.querySelectorAll('#initialCategories tr.initial-item').forEach(row=>{
      const categoryId=String(row.dataset.categoryId||'');
      const categoryName=data?.categories?.find(c=>String(c.id)===categoryId)?.name||'';
      const matchesCategory=!selectedCategory||categoryId===selectedCategory;
      const matchesSearch=!search||rowSearchText(row,categoryName).includes(search);
      const matchesStatus=rowMatchesStatus(row,selectedStatus);
      setRowVisibility(row,matchesCategory&&matchesSearch&&matchesStatus);
    });
    const active=Boolean(search||selectedCategory||selectedStatus);
    $('#initialClearFiltersBtn')?.classList.toggle('hidden',!active);
  }
  function bindFilterControls(){
    const searchInput=$('#initialSearchInput');
    const categorySelect=$('#initialFilterCategory');
    const statusSelect=$('#initialFilterStatus');
    const clearButton=$('#initialClearFiltersBtn');
    if(searchInput){
      searchInput.oninput=applyFilters;
      searchInput.onsearch=applyFilters;
      searchInput.onkeyup=applyFilters;
    }
    if(categorySelect)categorySelect.onchange=applyFilters;
    if(statusSelect)statusSelect.onchange=applyFilters;
    if(clearButton)clearButton.onclick=clearFilters;
  }
  function render(){
    if(!data)load();
    sortItemsByCategory();
    $('#initialTitle').value=data.title||'Status XCMG MINA';$('#initialDate').value=data.date||today();$('#initialTeam').value=data.team||'';$('#initialWeekday').value=data.weekday||weekday(data.date||today());
    $('#initialCategories').innerHTML=unifiedTableHtml();
    refreshFilterOptions();
    if($('#initialSearchInput'))$('#initialSearchInput').value=filterState.search;
    if($('#initialFilterStatus'))$('#initialFilterStatus').value=filterState.status;
    bindFilterControls();
    applyFilters();
    generate();
  }
  function personLine(status,name,type){
    if(status==='none')return '';
    const noun=type==='operator'?'OPERADOR':'SINALEIRO';
    const emoji=status==='with'?statusDef('green').emoji:statusDef('orange').emoji;
    if(status==='without')return `${emoji} SEM ${noun}`;
    return `${emoji} COM ${noun}${name?` – ${name}`:''}`;
  }
  function lineFor(x){
    const emoji=statusDef(x.status).emoji;
    const equipment=equipmentLabel(x.prefix,x.capacity);
    const substitution=x.substitute?` (SUB. ${x.substitute})`:'';
    // WhatsApp: todos os equipamentos ficam em negrito, incluindo a substituição.
    const head=`${emoji} *${equipment}${substitution}*`.trim();
    const first=[head,x.location].filter(Boolean).join(' - ');
    const lines=[first];
    // O amarelo acrescenta automaticamente a descrição cadastrada para o selo,
    // sem alterar, desativar ou limpar os campos de operador e sinaleiro.
    // O local continua sendo informado manualmente pelo usuário.
    if(x.status==='yellow')lines.push(statusDef('yellow').label);
    const op=personLine(x.operatorStatus,x.operator,'operator');if(op)lines.push(op);
    const sig=personLine(x.signalmanStatus,x.signalman,'signalman');if(sig)lines.push(sig);
    if(x.notes)lines.push(x.notes);
    return lines.join('\n');
  }
  function text(){capture();const d=new Intl.DateTimeFormat('pt-BR').format(new Date(`${data.date||today()}T12:00:00`));let out=`${data.title} ${d}\n\n${data.team.toUpperCase()}\n\n${data.weekday.toUpperCase()}\n`;
    data.categories.forEach(c=>{const valid=c.items.filter(x=>x.prefix||x.notes||x.operator||x.location);if(!c.name&&!valid.length)return;out+=`\n\n*${c.name}*\n`;valid.forEach(x=>{out+=`\n${lineFor(x)}\n`})});
    out+=`\n\nLegenda:\n${statusConfig.map(x=>`${x.emoji} ${x.label}`).join('\n')}\n\n📱 Gerado por XCMG REPORT`;return out.trim()}
  function generate(){const o=$('#initialOutput');if(o)o.value=text()}
  async function save(){capture();const ok=await persistCloud(STORAGE_KEY,data);generate();toast(ok?'Status do efetivo sincronizado com os aparelhos':'Status salvo neste aparelho; sincronização pendente')}
  function addItem(cat){
    capture();
    const categoryId=typeof cat==='string'?cat:cat?.dataset?.id;
    const c=data.categories.find(x=>x.id===categoryId);
    if(!c)return;
    c.items.push(item());
    render();
    requestAnimationFrame(()=>document.querySelector(`.initial-item[data-id="${CSS.escape(c.items[c.items.length-1].id)}"] [data-field="equipment"]`)?.focus());
  }
  function refreshEquipmentCategoryOptions(){
    const select=$('#initialEquipmentCategory');if(!select)return;
    select.innerHTML=data.categories.map(c=>`<option value="${esc(c.id)}">${esc(c.name||'Categoria sem nome')}</option>`).join('');
  }
  function refreshOperationalEquipmentCatalog(currentEquipment=''){
    const equipmentList=$('#initialEquipmentCatalog');
    const substituteList=$('#initialSubstituteCatalog');
    const catalog=typeof window.XCMGEquipmentCatalog==='function'?window.XCMGEquipmentCatalog():[];
    const labels=[];
    const seen=new Set();
    for(const entry of catalog){
      const label=normalizeEquipmentLabel(entry?.label||'');
      if(label&&!seen.has(label)){seen.add(label);labels.push(label);}
    }
    const current=normalizeEquipmentLabel(currentEquipment);
    if(current&&!seen.has(current))labels.unshift(current);
    const options=labels.map(label=>`<option value="${esc(label)}"></option>`).join('');
    if(equipmentList)equipmentList.innerHTML=options;
    if(substituteList)substituteList.innerHTML=options;
  }
  function findEquipmentRecord(id){
    for(const category of data.categories||[]){
      const equipment=(category.items||[]).find(entry=>String(entry.id)===String(id));
      if(equipment)return {category,equipment};
    }
    return null;
  }
  function openEquipmentEditor(row=null, explicitId=''){
    const id=String(explicitId||row?.dataset?.id||'');
    // Primeiro busca o registro salvo pelo ID. Assim o botão Detalhes nunca
    // depende do conteúdo visual da linha para preencher o modal.
    const found=id?findEquipmentRecord(id):null;
    const equipmentValue=normalizeEquipmentLabel(
      found?.equipment?.prefix||
      row?.dataset?.equipment||
      row?.querySelector('[data-field="equipment"]')?.value||
      row?.querySelector('.initial-equipment-saved strong')?.textContent||''
    );
    const substituteValue=normalizeEquipmentLabel(
      found?.equipment?.substitute||
      row?.querySelector('[data-field="substitute"]')?.value||
      row?.dataset?.substitute||''
    );
    const categoryId=String(
      found?.category?.id||
      row?.dataset?.categoryId||
      filterState.category||
      data.categories[0]?.id||''
    );

    refreshEquipmentCategoryOptions();
    refreshOperationalEquipmentCatalog(equipmentValue);
    const modal=$('#initialEquipmentModalBackdrop');
    const editId=$('#initialEquipmentEditId');
    const prefixField=$('#initialEquipmentPrefix');
    const substituteField=$('#initialEquipmentSubstitute');
    const categoryField=$('#initialEquipmentCategory');
    const title=$('#initialEquipmentModalTitle');
    if(!modal||!editId||!prefixField||!substituteField||!categoryField||!title)return;

    editId.value=id;
    prefixField.value=equipmentValue;
    substituteField.value=substituteValue;
    categoryField.value=categoryId;
    title.textContent=id?'Editar equipamento':'Novo equipamento';
    modal.classList.remove('hidden');

    // Reaplica após o modal abrir para impedir que reset/reflow de navegador
    // ou de PWA apague os valores carregados.
    requestAnimationFrame(()=>{
      editId.value=id;
      prefixField.value=equipmentValue;
      substituteField.value=substituteValue;
      categoryField.value=categoryId;
      prefixField.focus();
      prefixField.select();
    });
  }
  function closeEquipmentEditor(){$('#initialEquipmentModalBackdrop')?.classList.add('hidden');$('#initialEquipmentForm')?.reset()}
  function saveEquipmentEditor(ev){
    ev.preventDefault();capture();
    const id=$('#initialEquipmentEditId').value;
    const prefix=normalizeEquipmentLabel($('#initialEquipmentPrefix').value);
    const substitute=normalizeEquipmentLabel($('#initialEquipmentSubstitute').value);
    const categoryId=$('#initialEquipmentCategory').value;
    if(!prefix||!categoryId)return;
    let current=null;
    for(const c of data.categories){const found=c.items.find(x=>x.id===id);if(found){current=found;c.items=c.items.filter(x=>x.id!==id)}}
    const target=data.categories.find(c=>c.id===categoryId);if(!target)return;
    if(current){current.prefix=prefix;current.capacity='';current.substitute=substitute;target.items.push(current)}
    else target.items.push(item('green',prefix,'','','','','','','',substitute));
    persistCloud(STORAGE_KEY,data);
    closeEquipmentEditor();render();toast(id?'Equipamento atualizado e sincronizado':'Equipamento cadastrado e sincronizado');
  }
  function addFilteredEquipment(){openEquipmentEditor(null)}
  function clearFilters(){
    filterState.search='';filterState.category='';filterState.status='';
    if($('#initialSearchInput'))$('#initialSearchInput').value='';
    if($('#initialFilterCategory'))$('#initialFilterCategory').value='';
    if($('#initialFilterStatus'))$('#initialFilterStatus').value='';
    applyFilters();
  }
  function removeItem(row){capture();for(const c of data.categories)c.items=c.items.filter(x=>x.id!==row.dataset.id);render()}
  function addCategory(){capture();const name=prompt('Nome da nova categoria:','Nova categoria');if(!name?.trim())return;const c={id:uid(),name:name.trim(),items:[item()]};data.categories.push(c);filterState.category=c.id;render()}
  function syncEquipment(input){
    const equipment=parseEquipment(input.value);
    input.value=equipment.prefix;
  }
  function syncPersonFields(select){
    const row=select.closest('.initial-item');
    const field=select.dataset.field==='operatorStatus'?'operator':'signalman';
    const input=row?.querySelector(`[data-field="${field}"]`);
    if(!input)return;
    input.disabled=select.value!=='with';
    if(select.value!=='with')input.value='';
  }
  function setRowControl(row,value){
    row.dataset.control=value;
    const btn=row.querySelector('[data-control-toggle]');
    if(btn){btn.classList.toggle('checked',value==='checked');btn.classList.toggle('pending',value!=='checked');btn.textContent=controlLabel(value)}
  }
  async function persistRow(row,markChecked=true){
    if(markChecked)setRowControl(row,'checked');
    capture();
    const ok=await persistCloud(STORAGE_KEY,data);
    generate();
    toast(ok?(markChecked?'Equipamento salvo, conferido e sincronizado':'Controle interno atualizado e sincronizado'):'Alteração salva neste aparelho; sincronização pendente');
  }
  function openStatusConfig(){
    const body=$('#initialStatusConfigRows');
    if(!body)return;
    body.innerHTML=statusConfig.map(x=>`<div class="initial-status-config-row" data-key="${esc(x.key)}"><span class="initial-status-config-color" data-status="${esc(x.key)}"></span><input class="initial-status-config-emoji" value="${esc(x.emoji)}" maxlength="4" aria-label="Emoji"><input class="initial-status-config-label" value="${esc(x.label)}" aria-label="Descrição do status"></div>`).join('');
    $('#initialStatusConfigBackdrop')?.classList.remove('hidden');
  }
  function closeStatusConfig(){$('#initialStatusConfigBackdrop')?.classList.add('hidden')}
  function saveStatusConfig(event){
    event.preventDefault();
    const rows=[...document.querySelectorAll('#initialStatusConfigRows .initial-status-config-row')];
    statusConfig=rows.map(row=>({key:row.dataset.key,emoji:row.querySelector('.initial-status-config-emoji').value.trim()||statusDef(row.dataset.key).emoji,label:row.querySelector('.initial-status-config-label').value.trim()||statusDef(row.dataset.key).label}));
    persistCloud(STATUS_CONFIG_KEY,statusConfig);
    closeStatusConfig();render();toast('Legenda do Status do Efetivo atualizada e sincronizada');
  }
  function resetStatusConfig(){
    statusConfig=DEFAULT_STATUS_CONFIG.map(x=>({...x}));
    persistCloud(STATUS_CONFIG_KEY,statusConfig);
    openStatusConfig();toast('Legenda padrão restaurada e sincronizada');
  }
  function bind(){
    // Vinculação direta e reaplicada após cada renderização.
    bindFilterControls();
    $('#initialNewEquipmentBtn')?.addEventListener('click',addFilteredEquipment);
    $('#initialEditLegendBtn')?.addEventListener('click',openStatusConfig);
    $('#initialStatusConfigForm')?.addEventListener('submit',saveStatusConfig);
    $('#closeInitialStatusConfigBtn')?.addEventListener('click',closeStatusConfig);
    $('#cancelInitialStatusConfigBtn')?.addEventListener('click',closeStatusConfig);
    $('#resetInitialStatusConfigBtn')?.addEventListener('click',resetStatusConfig);
    $('#initialEquipmentForm')?.addEventListener('submit',saveEquipmentEditor);
    $('#closeInitialEquipmentModalBtn')?.addEventListener('click',closeEquipmentEditor);
    $('#cancelInitialEquipmentModalBtn')?.addEventListener('click',closeEquipmentEditor);
    $('#initialDate')?.addEventListener('change',e=>{$('#initialWeekday').value=weekday(e.target.value);generate()});
    ['initialTitle','initialTeam','initialWeekday'].forEach(id=>$('#'+id)?.addEventListener('input',generate));
    $('#initialCategories')?.addEventListener('input',e=>{dirty=true;const row=e.target.closest('.initial-item');if(row&&!e.target.matches('[data-control-toggle],[data-save-row]'))setRowControl(row,'pending');applyFilters();generate()});
    $('#initialCategories')?.addEventListener('change',e=>{dirty=true;const row=e.target.closest('.initial-item');if(row)setRowControl(row,'pending');if(e.target.matches('[data-field="status"]')){const control=e.target.closest('.initial-status-control');if(control)control.dataset.status=e.target.value;}if(e.target.matches('[data-field="equipment"]'))syncEquipment(e.target);if(e.target.matches('[data-field="operatorStatus"],[data-field="signalmanStatus"]'))syncPersonFields(e.target);applyFilters();generate()});
    $('#initialCategories')?.addEventListener('click',e=>{const row=e.target.closest('.initial-item');if(e.target.closest('[data-save-row]')&&row)persistRow(row,true);else if(e.target.closest('[data-edit-equipment]')&&row){const btn=e.target.closest('[data-edit-equipment]');openEquipmentEditor(row,btn.dataset.editId||row.dataset.id||'')}else if(e.target.closest('[data-control-toggle]')&&row){setRowControl(row,row.dataset.control==='checked'?'pending':'checked');persistRow(row,false)}else if(e.target.closest('[data-remove-item]')&&row)removeItem(row)});
    $('#initialAddCategoryBtn')?.addEventListener('click',addCategory);
    $('#initialGenerateBtn')?.addEventListener('click',()=>{generate();toast('Mensagem atualizada')});
    $('#initialCopyBtn')?.addEventListener('click',async()=>{generate();await navigator.clipboard.writeText($('#initialOutput').value);toast('Status do efetivo copiado')});
    $('#initialShareBtn')?.addEventListener('click',async()=>{generate();const text=$('#initialOutput').value;if(navigator.share)await navigator.share({title:'Status do Efetivo',text});else{await navigator.clipboard.writeText(text);toast('Copiado para compartilhar')}});
  }
  function reloadFromStorage(){
    load();
    if(initialized)render();
  }
  window.addEventListener('xcmg-cloud-update',event=>{
    const key=event.detail?.key;
    if(key===STORAGE_KEY||key===STATUS_CONFIG_KEY){
      reloadFromStorage();
      toast(key===STORAGE_KEY?'Status do efetivo atualizado em outro dispositivo':'Legenda do status atualizada');
    }
  });
  let initialized=false;
  function init(){
    if(initialized)return;
    initialized=true;
    load();bind();render();
    window.addEventListener('online',()=>setTimeout(()=>pullCloud(false),900));
    window.addEventListener('focus',()=>pullCloud(false));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')pullCloud(false)});
    setInterval(()=>{if(document.visibilityState==='visible')pullCloud(false)},12000);
    setTimeout(()=>pullCloud(false),1800);
  }
  window.XCMGInitialStatus={init,render,generate,reloadFromStorage,pullCloud};
})();

// v2.12.23 — Equipamentos em negrito na mensagem e substituição no formato (SUB. PREFIXO).
