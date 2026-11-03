(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const apiBase = String(window.SHADOW_ALBUM_CONFIG?.apiBase || '').replace(/\/$/,'');
  const gallery = $('#gallery');
  const viewDialog = $('#viewDialog');
  const toast = $('#toast');
  const empty = $('#noresults');
  const loading = $('#galleryLoading');
  const moreWrap = $('#moreWrap');
  const playSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 11 7-11 7Z"/></svg>';
  const expandSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>';
  let collection=[],visible=[],activeFilter='all',currentView=0;
  let version='',busy=false,renderLimit=96,toastTimer=0;
  const getApi = path => apiBase + path;

  async function api(path) {
    if(!apiBase) throw Error('Ο διακομιστής του άλμπουμ δεν έχει συνδεθεί.');
    const r=await fetch(getApi(path),{cache:'no-store'});
    const body=await r.json().catch(()=>({}));
    if(r.status===401) {
      // Sessions expire after seven days or immediately when the secret rotates.
      // Never leave guests looking at a broken/empty gallery.
      location.replace('/');
      throw Error('Η πύλη ζητά ξανά το συνθηματικό.');
    }
    if(!r.ok) throw Error(body.error||'Δεν ήταν δυνατή η επικοινωνία με το άλμπουμ.');
    return body;
  }
  function notify(text) {
    toast.textContent=text;
    toast.hidden=false;
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>{toast.hidden=true;},4500);
  }
  function setCounts() {
    const photos=collection.filter(x=>x.type==='image').length;
    const videos=collection.filter(x=>x.type==='video').length;
    $('#allFilterCount').textContent=collection.length;
    $('#imageFilterCount').textContent=photos;
    $('#videoFilterCount').textContent=videos;
  }
  function render() {
    const sort=$('#sort').value;
    visible=collection.filter(x=>activeFilter==='all'||x.type===activeFilter);
    visible.sort((a,b)=>sort==='old'?a.created-b.created:b.created-a.created);
    const part=document.createDocumentFragment();
    visible.slice(0,renderLimit).forEach((x,index)=>{
      const card=document.createElement('figure');
      card.className='gallery-card';
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='card-hit';
      btn.style.setProperty('--tile-h',(240+(index%6)*32)+'px');
      // Accessible without revealing internal Drive filenames in the UI.
      btn.setAttribute('aria-label',(x.type==='video'?'Άνοιγμα βίντεο ':'Άνοιγμα φωτογραφίας ')+(index+1));
      const img=document.createElement('img');
      img.src=x.poster;
      img.alt='';
      img.loading=index<8?'eager':'lazy';
      img.decoding='async';
      img.onerror=()=>{img.onerror=null;img.src='./assets/no-preview.svg';};
      const top=document.createElement('div');
      top.className='card-top';
      if(x.type==='video'){
        const play=document.createElement('span');
        play.className='video-play';
        play.innerHTML=playSvg;
        top.append(play);
      }
      btn.append(img,top);
      if(x.type==='image'){
        const expand=document.createElement('span');
        expand.className='card-view';
        expand.innerHTML=expandSvg;
        btn.append(expand);
      }
      card.append(btn);
      part.append(card);
      btn.addEventListener('click',()=>openViewer(index));
    });
    gallery.replaceChildren(part);
    moreWrap.hidden=visible.length<=renderLimit;
    empty.hidden=visible.length!==0||busy;
    if(!collection.length)empty.textContent='Το αρχείο είναι άδειο.';
    else empty.textContent='Δεν βρέθηκαν πειστήρια.';
  }
  function normalize(item) {
    if(!item?.id || (item.type!=='video' && item.type!=='image'))return null;
    return {
      id:item.id,type:item.type,title:item.name||'Ανάμνηση',
      poster:getApi(item.thumbnailUrl),src:getApi(item.mediaUrl),
      created:Date.parse(item.createdTime)||Date.now()
    };
  }
  async function refreshCollection(initial=false) {
    if(busy || viewDialog.open) return;
    busy=true;
    loading.hidden=false;
    let modified=false;
    try {
      const fresh=[];
      let cursor='',nextVersion='';
      do {
        const data=await api('/api/items'+(cursor?'?page='+encodeURIComponent(cursor):''));
        nextVersion=data.version;
        fresh.push(...(data.items||[]).map(normalize).filter(Boolean));
        cursor=data.nextPageToken||'';
      }while(cursor);
      if(!initial && nextVersion===version) return;
      const old=new Set(collection.map(x=>x.id));
      const additions=fresh.filter(x=>!old.has(x.id)).length;
      collection=fresh;
      version=nextVersion;
      modified=true;
      setCounts();
      if(!initial && additions>0)notify(
        additions===1?'Μία νέα ανάμνηση προστέθηκε στη συλλογή!':
          additions+' νέες αναμνήσεις προστέθηκαν στη συλλογή!'
      );
    }catch(e){
      if(initial) {
        empty.hidden=false;empty.textContent=e.message;
      }
      if(!initial)console.warn('Gallery update:',e.message);
      else notify(e.message);
    }finally{
      busy=false;
      loading.hidden=true;
      // Rebuild the DOM exactly once and only after an actual change.
      if(modified)render();
    }
  }
  function showViewer() {
    const x=visible[currentView];
    if(!x)return;
    const slot=$('#viewerMedia');slot.replaceChildren();
    if(x.type==='video') {
      const video=document.createElement('video');
      video.src=x.src;video.controls=true;video.playsInline=true;
      video.preload='metadata';video.poster=x.poster;video.setAttribute('aria-label','Αναπαραγωγή βίντεο');
      slot.append(video);
    }else {
      const img=document.createElement('img');img.src=x.src;img.alt='Φωτογραφία σε πλήρη προβολή';
      slot.append(img);
    }
    $('#prevBtn').hidden=$('#nextBtn').hidden=visible.length<2;
  }
  function openViewer(index) {
    currentView=index;
    showViewer();
    viewDialog.showModal();
  }
  function nextViewer(delta) {
    if(!visible.length)return;
    currentView=(currentView+delta+visible.length)%visible.length;
    showViewer();
  }
  $('#prevBtn').addEventListener('click',()=>nextViewer(-1));
  $('#nextBtn').addEventListener('click',()=>nextViewer(1));
  $('#closeViewer').addEventListener('click',()=>viewDialog.close());
  // Dismiss by tapping the dark canvas around the image; no popup chrome.
  $('#viewerStage').addEventListener('click',e=>{
    if(e.target===$('#viewerStage')||e.target===$('#viewerMedia')) viewDialog.close();
  });
  viewDialog.addEventListener('close',()=>$('#viewerMedia').replaceChildren());
  let touchX=null;
  $('#viewerStage').addEventListener('touchstart',e=>{touchX=e.touches[0].clientX;},{passive:true});
  $('#viewerStage').addEventListener('touchend',e=>{
    if(touchX===null)return;
    const diff=e.changedTouches[0].clientX-touchX;
    if(Math.abs(diff)>65)nextViewer(diff<0?1:-1);
    touchX=null;
  },{passive:true});
  document.addEventListener('keydown',e=>{
    if(!viewDialog.open)return;
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
      e.preventDefault();nextViewer(e.key==='ArrowLeft'?-1:1);
    }
  });
  for(const button of document.querySelectorAll('.filter')){
    button.addEventListener('click',()=>{
      activeFilter=button.dataset.filter;
      for(const x of document.querySelectorAll('.filter')){
        x.classList.toggle('active',x===button);
        x.setAttribute('aria-pressed',String(x===button));
      }
      renderLimit=96;
      render();
    });
  }
  const logoutButton=$('#logoutButton');
  if(logoutButton)logoutButton.addEventListener('click',async()=>{
    logoutButton.disabled=true;
    try {
      await fetch('/auth/logout',{method:'POST',credentials:'same-origin',cache:'no-store'});
    }finally {
      location.replace('/');
    }
  });
  $('#sort').addEventListener('change',()=>{renderLimit=96;render();});
  $('#loadMore').addEventListener('click',()=>{renderLimit+=96;render();});
  async function checkUpdates() {
    if(busy||!version||document.visibilityState!=='visible'||viewDialog.open)return;
    try {
      const latest=await api('/api/changes?since='+encodeURIComponent(version));
      if(latest.changed)await refreshCollection();
    }catch(e){console.warn('Sync check:',e.message);}
  }
  async function initialize(){
    if(!apiBase){
      empty.hidden=false;empty.textContent='Η υπηρεσία του άλμπουμ δεν έχει ακόμη συνδεθεί.';
      return;
    }
    try {
      const config=await api('/api/config');
      if(!config.ready)throw Error('Η ασφαλής σύνδεση του φακέλου Google Drive δεν έχει ολοκληρωθεί.');
      await refreshCollection(true);
      setInterval(checkUpdates,60000);
      document.addEventListener('visibilitychange',()=>{
        if(document.visibilityState==='visible')checkUpdates();
      });
    }catch(e){
      empty.hidden=false;empty.textContent=e.message;
    }
  }
  initialize();
})();