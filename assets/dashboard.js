/* Local-only user marks. Reading a note never marks learner mastery. */
(() => {
  'use strict';
  const topButton = document.querySelector('.mobile-top');
  if (topButton) {
    const updateTopButton = () => { topButton.hidden = window.scrollY < 700; };
    window.addEventListener('scroll',updateTopButton,{passive:true});
    window.addEventListener('pageshow',updateTopButton);
    topButton.addEventListener('click',()=>window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}));
    updateTopButton();
  }
  const root = document.querySelector('.lesson-library');
  if (!root) return;
  const cards = Array.from(root.querySelectorAll('.lesson-card'));
  const codes = new Set(cards.map(card => card.dataset.code));
  const stateNames = {ready:'准备练', practicing:'练习中', review:'待回顾', output:'已输出', mastered:'已掌握'};
  const allowedStates = new Set(Object.keys(stateNames));
  const key = 'susan-practice-v1';
  const urlNow = () => new URL(window.location.href);
  // A UI revision query must not discard an older saved reading location.
  const notePath = href => typeof href === 'string' ? href.split(/[?#]/,1)[0] : '';
  const matchingVisit = (code,href) => [...document.querySelectorAll('a[data-visit]')].find(a=>a.dataset.visit===code && notePath(a.getAttribute('href'))===notePath(href));
  let store = {states:{}, last:null};
  let persistent = true;
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null');
    if (raw && raw.states && typeof raw.states === 'object' && !Array.isArray(raw.states)) {
      for (const [code, value] of Object.entries(raw.states)) {
        if (codes.has(code) && allowedStates.has(value)) store.states[code] = value;
      }
      if (raw.last && typeof raw.last === 'object' && codes.has(raw.last.code) && typeof raw.last.href === 'string') {
        const matching = matchingVisit(raw.last.code,raw.last.href);
        if (matching) store.last = {code:raw.last.code,href:matching.getAttribute('href')};
      }
    }
  } catch (_) { persistent = false; }
  const toast = document.querySelector('.toast');
  let timer;
  function notify(text) {
    if (!toast) return;
    toast.textContent = text; toast.hidden = false; clearTimeout(timer);
    timer = setTimeout(() => { toast.hidden = true; }, 3600);
  }
  function save() {
    try { localStorage.setItem(key, JSON.stringify(store)); }
    catch (_) { persistent = false; }
  }
  function updateMarks() {
    document.querySelectorAll('select[data-practice]').forEach(select => {
      select.value = store.states[select.dataset.practice] || '';
      select.dataset.marked = String(!!select.value);
    });
    document.querySelectorAll('[data-state-count]').forEach(n => {
      n.textContent = String(Object.values(store.states).filter(value => value === n.dataset.stateCount).length);
    });

  }
  updateMarks();
  const input = root.querySelector('input[type=search]');
  const series = root.querySelector('#series-filter');
  const practice = root.querySelector('#practice-filter');
  const sort = root.querySelector('#sort-filter');
  const grid = root.querySelector('.lesson-grid');
  const empty = root.querySelector('.empty-state');
  let theme='', latest=false, range=null;
  const normalized = text => text.toLowerCase().replace(/[’‘]/g,"'").replace(/([ab])\s*-?\s*(\d{1,3})\b/g,(_,s,n)=>s+'-'+n.padStart(3,'0')).trim();
  function loadURL() {
    const params = urlNow().searchParams;
    input.value = params.get('q') || '';
    series.value = ['A','B'].includes(params.get('series')) ? params.get('series') : '';
    practice.value = (allowedStates.has(params.get('state')) || params.get('state') === 'unmarked') ? params.get('state') : '';
    sort.value = params.get('sort') === 'newest' ? 'newest' : 'course';
    // Keep previously shared theme/latest URLs readable without rendering filter chips.
    theme = cards.some(card => card.dataset.theme === params.get('theme')) ? params.get('theme') : '';
    latest = params.get('latest') === '1';
    const match = (params.get('range') || '').match(/^([AB]-\d{3}):([AB]-\d{3})$/);
    range = match && match[1] <= match[2] ? [match[1], match[2]] : null;
  }
  function syncURL() {
    const u = urlNow();
    const values = {q:input.value.trim(),series:series.value,state:practice.value,sort:sort.value==='newest'?'newest':'',theme,latest:latest?'1':'',range:range?range.join(':'):'',page:''};
    for (const [k,v] of Object.entries(values)) {if (v) u.searchParams.set(k,v); else u.searchParams.delete(k);}
    if (/^#(?:core|ladder)-[AB]-\d{3}$/.test(u.hash)) u.hash = root.id;
    try {history.replaceState(null,'',u);} catch (_) {/* file:// remains readable */}
  }
  function render(sync=false) {
    let filtered = cards.filter(card => {
      const code=card.dataset.code;
      const mark=store.states[code]||'';
      return (!input.value.trim() || normalized(card.dataset.key).includes(normalized(input.value))) &&
        (!series.value || card.dataset.series===series.value) &&
        (!theme || card.dataset.theme===theme) &&
        (!latest || card.dataset.new==='true') &&
        (!range || (code>=range[0] && code<=range[1])) &&
        (!practice.value || (practice.value==='unmarked'?!mark:practice.value===mark));
    });
    filtered.sort((a,b) => sort.value==='newest' ? b.dataset.code.localeCompare(a.dataset.code) : a.dataset.code.localeCompare(b.dataset.code));
    const visibleSet = new Set(filtered);
    // Order all cards, including hidden ones, without losing original fragment targets.
    filtered.forEach(card=>grid.appendChild(card));
    cards.forEach(card=>{card.hidden=!visibleSet.has(card);});
    empty.hidden = filtered.length!==0;
    if (sync) syncURL();
  }
  function revealHash() {
    const hash = decodeURIComponent(location.hash.slice(1));
    const card = cards.find(card=>card.id===hash);
    if (card) {
      // A saved lesson URL always reveals the requested lesson, regardless of filters.
      input.value='';series.value='';practice.value='';theme='';latest=false;range=null;sort.value='course';
      render(); requestAnimationFrame(()=>card.scrollIntoView({block:'start'}));
    }
    // Removed route bookmarks now land on the useful sentence library.
    if (hash === 'learning-route') {
      history.replaceState(null,'',location.pathname+location.search+'#core-notes');
      requestAnimationFrame(()=>root.scrollIntoView({block:'start'}));
    }
    // The homepage source table was removed; keep old directory bookmarks useful.
    if (['full-directory','source-directory'].includes(hash)) {
      window.location.replace('original-videos.html');
    }
  }
  function changed(){render(true);}
  input.addEventListener('input',changed);
  [series,practice,sort].forEach(select=>select.addEventListener('change',changed));
  root.querySelectorAll('[data-reset]').forEach(button=>button.addEventListener('click',()=>{input.value='';series.value='';practice.value='';sort.value='course';theme='';latest=false;range=null;changed();}));
  document.querySelectorAll('select[data-practice]').forEach(select=>select.addEventListener('change',()=>{
    if (allowedStates.has(select.value)) store.states[select.dataset.practice]=select.value;
    else delete store.states[select.dataset.practice];
    save(); updateMarks(); render();
    notify(select.value ? `${select.dataset.practice} 已标记为「${stateNames[select.value]}」`+(persistent?' · 保存在本浏览器':' · 仅本次会话') : `${select.dataset.practice} 已取消标记`);
  }));
  document.addEventListener('click',event=>{
    const a=event.target.closest('a[data-visit]');
    if (!a || !codes.has(a.dataset.visit)) return;
    const href=a.getAttribute('href');
    if (!href || !/^(核心笔记|学习笔记|句型阶梯)\//.test(href) || !notePath(href).endsWith('.html')) return;
    store.last={code:a.dataset.visit,href};save();
  });
  window.addEventListener('hashchange',revealHash);
  window.addEventListener('popstate',()=>{loadURL();render();revealHash();});
  function refreshStoredMarks() {
    if (!persistent) return;
    try {
      const raw = JSON.parse(localStorage.getItem(key) || 'null');
      const fresh = {};
      if (raw && raw.states && typeof raw.states === 'object') {
        for (const [code,value] of Object.entries(raw.states)) {
          if (codes.has(code) && allowedStates.has(value)) fresh[code]=value;
        }
      }
      store.states=fresh;
      if (raw && raw.last && codes.has(raw.last.code)) {
        const matching = matchingVisit(raw.last.code,raw.last.href);
        if (matching) store.last={code:raw.last.code,href:matching.getAttribute('href')};
      }
      updateMarks(); render();
    } catch (_) { /* Keep the current session usable if storage is unavailable. */ }
  }
  window.addEventListener('pageshow',refreshStoredMarks);
  window.addEventListener('storage',event=>{if(event.key===key) refreshStoredMarks();});
  loadURL();render();revealHash();
})();
