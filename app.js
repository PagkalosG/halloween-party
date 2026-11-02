(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const apiBase = String(window.SHADOW_ALBUM_CONFIG?.apiBase || '').replace(/\/$/,'');
  const gallery = $('#gallery');
  const viewDialog = $('#viewDialog');
  const toast = $('#toast');
  const empty = $('#noresults');
  const banner = $('#connectionBanner');
  const loading = $('#galleryLoading');
  const moreWrap = $('#moreWrap');
  const playSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m8 5 12 7-12 7Z"/></svg>';
  const expandSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>';
  let collection=[],visible=[],activeFilter='all',currentView=0;
  let version='',busy=false,renderLimit=96,toastTimer=0;
  const getApi = path => apiBase + path;

  async function api(path) {
    if(!apiBase) throw Error('Ο διακομιστής του άλμπουμ δεν έχει συνδεθεί.');
    const r=await fetch(getApi(path),{cache:'no-store'});
    const body=await r.json().catch(()=>({}));
    if(!r.ok) throw Error(body.error||'Δεν ήταν δυνατή η επικοινωνία με το άλμπουμ.');
    return body;
  }
  function notify(text) {
    toast.textContent=text;
    toast.hidden=false;
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>{toast.hidden=true;},4500);
  }
  function setBanner(message,style='') {
    banner.textContent=message;
    banner.className='previewbar'+(style?' '+style:'');
  }
  function setCounts() {
    const photos=collection.filter(x=>x.type==='image').length;
    const videos=collection.filter(x=>x.type==='video').length;
    $('#photoCount').textContent=photos;
    $('#videoCount').textContent=videos;
    $('#totalCount').textContent=collection.length;
    $('#allFilterCount').textContent=collection.length;
    $('#imageFilterCount').textContent=photos;
    $('#videoFilterCount').textContent=videos;
  }
  const formatDate = date => Number.isFinite(date)
    ? new Date(date).toLocaleDateString('el-GR',{day:'numeric',month:'short',year:'numeric'})
    : '';
  function render() {
    const term=$('#search').value.trim().toLocaleLowerCase('el');
    const sort=$('#sort').value;
    visible=collection.filter(x=>
      (activeFilter==='all'||x.type===activeFilter) &&
      x.title.toLocaleLowerCase('el').includes(term));
    visible.sort((a,b)=>sort==='old'?a.created-b.created:
      sort==='name'?a.title.localeCompare(b.title,'el'):b.created-a.created);
    const part=document.createDocumentFragment();
    visible.slice(0,renderLimit).forEach((x,index)=>{
      const card=document.createElement('figure');card.className='gallery-card';
      const btn=document.createElement('button');btn.type='button';btn.className='card-hit';
      btn.style.setProperty('--tile-h',(220+(index%5)*29)+'px');
      btn.setAttribute('aria-label','Προβολή: '+x.title);
      const img=document.createElement('img');
      img.src=x.poster;img.alt=x.title;img.loading=index<8?'eager':'lazy';
      img.decoding='async';
      img.onerror=()=>{img.onerror=null;img.src='./assets/no-preview.svg';};
      const top=document.createElement('div');top.className='card-top';
      const badge=document.createElement('span');
      badge.className='chip'+(x.type==='video'?' video':'');
      badge.textContent=x.type==='video'?'▶ ΒΙΝΤΕΟ':'ΦΩΤΟΓΡΑΦΙΑ';
      top.append(badge);
      const labels=document.createElement('div');labels.className='card-labels';
      const titleWrap=document.createElement('div');
      const title=document.createElement('strong');title.textContent=x.title;
      const date=document.createElement('small');date.textContent=formatDate(x.created);
      titleWrap.append(title,date);
      const icon=document.createElement('span');icon.className='card-view';
      icon.innerHTML=x.type==='video'?playSvg:expandSvg;
      labels.append(titleWrap,icon);
      btn.append(img,top,labels);card.append(btn);part.append(card);
      btn.addEventListener('click',()=>openViewer(index));
    });
    gallery.replaceChildren(part);
    moreWrap.hidden=visible.length<=renderLimit;
    empty.hidden=visible.length!==0||busy;
    if(!collection.length)empty.textContent='Δεν υπάρχουν ακόμη φωτογραφίες ή βίντεο στον φάκελο.';
    else empty.textContent='Δεν βρέθηκαν αναμνήσεις με αυτά τα φίλτρα.';
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
      setBanner('ΤΟ ΑΡΧΕΙΟ ΤΩΝ ΣΚΙΩΝ · ΖΩΝΤΑΝΗ ΣΥΛΛΟΓΗ','online');
      if(!initial && additions>0)notify(
        additions===1?'Μία νέα ανάμνηση προστέθηκε στη συλλογή!':
          additions+' νέες αναμνήσεις προστέθηκαν στη συλλογή!'
      );
    }catch(e){
      if(initial) {
        setBanner('Η ΣΥΛΛΟΓΗ ΔΕΝ ΕΙΝΑΙ ΑΚΟΜΗ ΔΙΑΘΕΣΙΜΗ','error');
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
    $('#viewTitle').textContent=x.title;
    $('#viewMeta').textContent=formatDate(x.created)+' · '+(x.type==='video'?'Βίντεο':'Φωτογραφία');
    $('#viewIndex').textContent=(currentView+1)+' / '+visible.length;
    const slot=$('#viewerMedia');slot.replaceChildren();
    if(x.type==='video') {
      const video=document.createElement('video');
      video.src=x.src;video.controls=true;video.playsInline=true;
      video.preload='metadata';video.poster=x.poster;video.setAttribute('aria-label',x.title);
      slot.append(video);
    }else {
      const img=document.createElement('img');img.src=x.src;img.alt=x.title;
      slot.append(img);
    }
    $('#prevBtn').hidden=$('#nextBtn').hidden=visible.length<2;
    $('#viewDownload').onclick=()=>{
      const sep=x.src.includes('?')?'&':'?';
      const link=document.createElement('a');
      link.href=x.src+sep+'download=1';link.target='_blank';link.rel='noopener';
      document.body.append(link);link.click();link.remove();
    };
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
  $('#search').addEventListener('input',()=>{renderLimit=96;render();});
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
      setBanner('Η ΣΥΛΛΟΓΗ ΠΕΡΙΜΕΝΕΙ ΤΗ ΣΥΝΔΕΣΗ ΜΕ ΤΟ DRIVE','error');
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
      setBanner('Η ΣΥΛΛΟΓΗ ΠΕΡΙΜΕΝΕΙ ΤΗ ΣΥΝΔΕΣΗ ΜΕ ΤΟ DRIVE','error');
      empty.hidden=false;empty.textContent=e.message;
    }
  }
  initialize();
})();