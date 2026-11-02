(() => {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const config = window.SHADOW_ALBUM_CONFIG || {};
  const apiBase = String(config.apiBase || "").replace(/\/$/, "");
  const gallery = $("#gallery");
  const uploadDialog = $("#uploadDialog");
  const viewDialog = $("#viewDialog");
  const fileInput = $("#fileInput");
  const uploadList = $("#uploadList");
  const toast = $("#toast");
  const empty = $("#noresults");
  const banner = $("#connectionBanner");
  const loading = $("#galleryLoading");
  const progress = $("#uploadProgress");
  const uploadDetail = $("#uploadDetail");
  const moreWrap = $("#moreWrap");
  const maxFileBytes = 300 * 1024 * 1024;
  let collection = [], visible = [], activeFilter = "all", currentView = 0;
  let selected = [], nextPageToken = null, busy = false, serverReady = false;
  let uploadsEnabled = false, turnstileWidget = null, turnstileSiteKey = "", toastTimer = 0;
  const videoExtensions = /\.(mp4|mov|webm|mkv)$/i;
  const imageExtensions = /\.(jpe?g|png|webp|gif|avif|heic|heif)$/i;
  const mimeByExtension = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
    avif: "image/avif", heic: "image/heic", heif: "image/heif",
    mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska"
  };
  const playSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m8 5 12 7-12 7Z"/></svg>';
  const expandSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>';
  function notify(message) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 5500);
  }
  function setBanner(message, tone = "") {
    banner.textContent = message;
    banner.className = "previewbar" + (tone ? " " + tone : "");
  }
  function getApi(path) { return apiBase + path; }
  async function api(path, options = {}) {
    if (!apiBase) throw Error("Δεν έχει συνδεθεί ακόμη η υπηρεσία του άλμπουμ.");
    const response = await fetch(getApi(path), { cache: "no-store", ...options });
    let data = {};
    try { data = await response.json(); } catch { /* Error details can be absent */ }
    if (!response.ok) throw Error(data.error || "Παρουσιάστηκε σφάλμα σύνδεσης.");
    return data;
  }
  function setCounts() {
    const images = collection.filter(x => x.type === "image").length;
    const videos = collection.length - images;
    $("#photoCount").textContent = images;
    $("#videoCount").textContent = videos;
    $("#totalCount").textContent = collection.length;
    $("#allFilterCount").textContent = collection.length;
    $("#imageFilterCount").textContent = images;
    $("#videoFilterCount").textContent = videos;
  }
  function formatDate(date) {
    return new Date(date).toLocaleDateString("el-GR", { day: "numeric", month: "short", year: "numeric" });
  }
  function render() {
    const term = $("#search").value.trim().toLocaleLowerCase("el");
    const sort = $("#sort").value;
    visible = collection.filter(x => (activeFilter === "all" || x.type === activeFilter) && x.title.toLocaleLowerCase("el").includes(term));
    visible.sort((a, b) => sort === "old" ? a.created - b.created : sort === "name" ? a.title.localeCompare(b.title, "el") : b.created - a.created);
    gallery.replaceChildren();
    empty.hidden = visible.length !== 0 || busy;
    visible.forEach((x, index) => {
      const card = document.createElement("figure"); card.className = "gallery-card";
      const btn = document.createElement("button"); btn.type = "button"; btn.className = "card-hit";
      btn.style.setProperty("--tile-h", (220 + (index % 5) * 29) + "px");
      btn.setAttribute("aria-label", "Προβολή: " + x.title);
      const img = document.createElement("img"); img.src = x.poster;
      img.alt = x.title; img.loading = index < 7 ? "eager" : "lazy";
      img.onerror = () => { img.onerror = null; img.src = "./assets/no-preview.svg"; };
      const top = document.createElement("div"); top.className = "card-top";
      const chip = document.createElement("span"); chip.className = "chip" + (x.type === "video" ? " video" : "");
      chip.textContent = x.type === "video" ? "▶ ΒΙΝΤΕΟ" : "ΦΩΤΟΓΡΑΦΙΑ"; top.append(chip);
      const labels = document.createElement("div"); labels.className = "card-labels";
      const text = document.createElement("div"); const name = document.createElement("strong"); name.textContent = x.title;
      const sub = document.createElement("small"); sub.textContent = formatDate(x.created);
      text.append(name, sub);
      const view = document.createElement("span"); view.className = "card-view"; view.innerHTML = x.type === "video" ? playSvg : expandSvg;
      labels.append(text, view); btn.append(img, top, labels); card.append(btn); gallery.append(card);
      btn.addEventListener("click", () => openViewer(index));
    });
  }
  function merge(items) {
    const map = new Map(collection.map(x => [x.id, x]));
    for (const item of items) {
      if (!item.id || (item.type !== "video" && item.type !== "image")) continue;
      map.set(item.id, {
        id: item.id, type: item.type, title: item.name,
        poster: getApi(item.thumbnailUrl), src: getApi(item.mediaUrl),
        created: Date.parse(item.createdTime) || Date.now()
      });
    }
    collection = [...map.values()]; setCounts(); render();
  }
  async function loadPage(cursor = "", quiet = false) {
    if (busy || !serverReady) return;
    busy = true; if (!quiet) loading.hidden = false;
    try {
      const result = await api("/api/items" + (cursor ? "?page=" + encodeURIComponent(cursor) : ""));
      nextPageToken = result.nextPageToken || null;
      merge(result.items || []);
      moreWrap.hidden = !nextPageToken;
      if (collection.length === 0) empty.textContent = "Δεν υπάρχουν ακόμη αναμνήσεις. Γίνε ο πρώτος που θα αφήσει ένα ίχνος…";
    } catch (e) {
      if (!quiet) { empty.hidden = false; empty.textContent = e.message; notify(e.message); }
    } finally { busy = false; loading.hidden = true; render(); }
  }
  function openViewer(index) { currentView = index; showViewer(); viewDialog.showModal(); }
  function showViewer() {
    const x = visible[currentView]; if (!x) return;
    $("#viewTitle").textContent = x.title;
    $("#viewMeta").textContent = formatDate(x.created) + " · " + (x.type === "video" ? "Βίντεο" : "Φωτογραφία");
    $("#viewIndex").textContent = (currentView + 1) + " / " + visible.length;
    const slot = $("#viewerMedia"); slot.replaceChildren();
    if (x.type === "video") {
      const video = document.createElement("video");
      video.src = x.src; video.controls = true; video.playsInline = true; video.preload = "metadata";
      video.poster = x.poster; video.setAttribute("aria-label", x.title); slot.append(video);
    } else {
      const img = document.createElement("img"); img.src = x.src; img.alt = x.title; slot.append(img);
    }
    $("#prevBtn").hidden = $("#nextBtn").hidden = visible.length < 2;
    $("#viewDownload").onclick = () => {
      const a = document.createElement("a"); a.href = getApi("/api/media/" + encodeURIComponent(x.id) + "?download=1");
      a.target = "_blank"; a.rel = "noopener"; document.body.append(a); a.click(); a.remove();
    };
  }
  function stepViewer(n) { if (!visible.length) return; currentView = (currentView + n + visible.length) % visible.length; showViewer(); }
  $("#prevBtn").addEventListener("click", () => stepViewer(-1));
  $("#nextBtn").addEventListener("click", () => stepViewer(1));
  $("#closeViewer").addEventListener("click", () => viewDialog.close());
  viewDialog.addEventListener("close", () => $("#viewerMedia").replaceChildren());
  let startX = null;
  $("#viewerStage").addEventListener("touchstart", e => { startX = e.touches[0].clientX; }, { passive: true });
  $("#viewerStage").addEventListener("touchend", e => {
    if (startX === null) return; const diff = e.changedTouches[0].clientX - startX;
    if (Math.abs(diff) > 65) stepViewer(diff < 0 ? 1 : -1); startX = null;
  }, { passive: true });
  document.addEventListener("keydown", e => {
    if (!viewDialog.open) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); stepViewer(e.key === "ArrowLeft" ? -1 : 1); }
  });
  for (const b of document.querySelectorAll(".filter")) {
    b.addEventListener("click", () => {
      activeFilter = b.dataset.filter;
      for (const x of document.querySelectorAll(".filter")) {
        x.classList.toggle("active", x === b); x.setAttribute("aria-pressed", String(x === b));
      }
      render();
    });
  }
  $("#search").addEventListener("input", render);
  $("#sort").addEventListener("change", render);
  $("#loadMore").addEventListener("click", () => { if (nextPageToken) loadPage(nextPageToken); });
  function openUpload() { uploadDialog.showModal(); }
  for (const id of ["#navUpload", "#heroUpload", "#bottomUpload"]) $(id).addEventListener("click", openUpload);
  $("#closeUpload").addEventListener("click", () => { if (!busy) uploadDialog.close(); });
  $("#chooseFiles").addEventListener("click", () => fileInput.click());
  function getMime(file) {
    if (file.type && (file.type.startsWith("image/") || file.type.startsWith("video/"))) return file.type;
    const ext = file.name.split(".").pop().toLowerCase(); return mimeByExtension[ext] || null;
  }
  const supported = new Set(Object.values(mimeByExtension));
  function addFiles(files) {
    let rejected = 0;
    for (const f of files) {
      const mime = getMime(f);
      if (!mime || !supported.has(mime) || f.size > maxFileBytes || !f.size) { rejected++; continue; }
      if (selected.some(s => s.file.name === f.name && s.file.size === f.size && s.file.lastModified === f.lastModified)) continue;
      selected.push({ file: f, mime, url: URL.createObjectURL(f) });
    }
    queueRender();
    if (rejected) notify("Κάποια αρχεία δεν υποστηρίζονται ή ξεπερνούν τα 300 MB.");
  }
  function queueRender() {
    uploadList.replaceChildren();
    selected.forEach((q, i) => {
      const box = document.createElement("div"); box.className = "queued";
      const media = document.createElement(q.mime.startsWith("video/") ? "video" : "img");
      media.src = q.url; media.muted = true; media.preload = "metadata"; media.playsInline = true;
      const remove = document.createElement("button"); remove.type = "button";
      remove.className = "remove-queued"; remove.textContent = "×"; remove.disabled = busy;
      remove.setAttribute("aria-label", "Αφαίρεση " + q.file.name);
      remove.addEventListener("click", () => { URL.revokeObjectURL(q.url); selected.splice(i, 1); queueRender(); });
      box.append(media, remove); uploadList.append(box);
    });
    $("#queuedCount").textContent = selected.length ? selected.length + " επιλεγμένα αρχεία" : "Δεν έχουν επιλεγεί αρχεία";
    $("#startUpload").disabled = !selected.length || !uploadsEnabled || busy;
  }
  fileInput.addEventListener("change", () => { addFiles(fileInput.files); fileInput.value = ""; });
  const drop = $("#dropzone");
  for (const type of ["dragenter", "dragover"]) drop.addEventListener(type, e => { e.preventDefault(); drop.classList.add("drag"); });
  for (const type of ["dragleave", "drop"]) drop.addEventListener(type, e => { e.preventDefault(); drop.classList.remove("drag"); });
  drop.addEventListener("drop", e => addFiles(e.dataTransfer.files));
  async function loadTurnstile(siteKey) {
    turnstileSiteKey = siteKey;
    if (!siteKey) return;
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true; script.onload = resolve; script.onerror = reject;
      document.head.append(script);
    });
    const wait = () => new Promise((resolve, reject) => {
      let tries = 0;
      const tick = () => {
        if (window.turnstile) return resolve();
        if (++tries > 30) return reject(Error("Δεν φορτώθηκε ο έλεγχος ασφάλειας."));
        setTimeout(tick, 100);
      }; tick();
    });
    await wait();
    turnstileWidget = window.turnstile.render("#turnstileSlot", { sitekey: siteKey, theme: "dark" });
  }
  async function getUploadGrant() {
    if (!window.turnstile || turnstileWidget === null) throw Error("Δεν φορτώθηκε ο έλεγχος ασφάλειας.");
    const token = window.turnstile.getResponse(turnstileWidget);
    if (!token) throw Error("Ολοκλήρωσε πρώτα τον έλεγχο ασφάλειας.");
    const result = await api("/api/upload/authorize", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ turnstileToken: token })
    });
    window.turnstile.reset(turnstileWidget);
    return result.grant;
  }
  async function sendFile(file, mime, grant, onProgress) {
    const started = await api("/api/upload/start", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant, name: file.name, size: file.size, mimeType: mime })
    });
    let offset = 0; const chunkSize = started.chunkSize || 4 * 1024 * 1024;
    while (offset < file.size) {
      const end = Math.min(file.size, offset + chunkSize);
      const body = file.slice(offset, end);
      let response; let success = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          response = await api("/api/upload/chunk", {
            method: "PUT",
            headers: { "X-Upload-Token": started.uploadToken, "Content-Range": "bytes " + offset + "-" + (end - 1) + "/" + file.size, "Content-Type": "application/octet-stream" },
            body
          });
          success = true; break;
        } catch (e) {
          if (attempt === 2) throw e;
          await new Promise(resolve => setTimeout(resolve, 750 * (attempt + 1)));
        }
      }
      if (!success) throw Error("Η αποστολή διακόπηκε.");
      if (response.done) { onProgress(file.size); return; }
      const m = String(response.range || "").match(/^bytes=0-(\d+)$/);
      const next = m ? Number(m[1]) + 1 : end;
      if (next <= offset || next > file.size) throw Error("Μη έγκυρη απόκριση προόδου από το Drive.");
      offset = next;
      onProgress(offset);
    }
  }
  $("#startUpload").addEventListener("click", async () => {
    if (!selected.length || busy || !uploadsEnabled) return;
    busy = true; queueRender(); $("#closeUpload").disabled = true;
    let done = 0; const files = [...selected];
    const total = files.reduce((sum, item) => sum + item.file.size, 0);
    let completedBytes = 0;
    try {
      const grant = await getUploadGrant();
      for (const item of files) {
        uploadDetail.textContent = "Αποστολή " + (done + 1) + "/" + files.length + ": " + item.file.name;
        await sendFile(item.file, item.mime, grant, uploaded => {
          progress.style.width = ((completedBytes + uploaded) / total * 100).toFixed(1) + "%";
        });
        completedBytes += item.file.size; done++;
        URL.revokeObjectURL(item.url);
        selected = selected.filter(q => q !== item); queueRender();
      }
      notify("Οι αναμνήσεις αποθηκεύτηκαν! Εμφανίζονται σύντομα στη συλλογή.");
      uploadDetail.textContent = "Η αποστολή ολοκληρώθηκε.";
      uploadDialog.close();
      setTimeout(() => loadPage("", true), 2500);
    } catch (e) {
      uploadDetail.textContent = "Στάλθηκαν " + done + " από " + files.length + " αρχεία. " + e.message;
      notify(e.message);
    } finally {
      busy = false; $("#closeUpload").disabled = false;
      queueRender(); setTimeout(() => { if (!busy) progress.style.width = "0%"; }, 1500);
    }
  });
  window.addEventListener("pagehide", () => selected.forEach(q => URL.revokeObjectURL(q.url)));
  async function initialize() {
    if (!apiBase) {
      setBanner("Η ΣΥΛΛΟΓΗ ΠΕΡΙΜΕΝΕΙ ΤΗ ΣΥΝΔΕΣΗ ΜΕ ΤΟ DRIVE", "error");
      empty.hidden = false;
      empty.textContent = "Ο φάκελος Drive δεν έχει συνδεθεί ακόμη. Η ιστοσελίδα είναι έτοιμη, αλλά η προβολή και η αποστολή δεν έχουν ενεργοποιηθεί.";
      $("#uploadDetail").textContent = "Η αποστολή θα είναι διαθέσιμη μόλις συνδεθεί το Drive.";
      queueRender(); return;
    }
    try {
      const info = await api("/api/config");
      serverReady = Boolean(info.ready);
      uploadsEnabled = Boolean(info.uploadsEnabled);
      if (!serverReady) throw Error("Το Google Drive δεν έχει εξουσιοδοτηθεί ακόμη.");
      setBanner("ΤΟ ΑΡΧΕΙΟ ΤΩΝ ΣΚΙΩΝ · ΖΩΝΤΑΝΗ ΣΥΛΛΟΓΗ", "online");
      if (uploadsEnabled) {
        loadTurnstile(info.turnstileSiteKey).catch(() => notify("Ο έλεγχος ασφάλειας δεν φορτώθηκε."));
      } else {
        $("#uploadDetail").textContent = "Ο διαχειριστής δεν έχει ενεργοποιήσει ακόμα την προσθήκη αρχείων.";
      }
      queueRender(); await loadPage();
      setInterval(() => { if (!busy && !viewDialog.open) loadPage("", true); }, 45000);
    } catch (e) {
      setBanner("Η ΣΥΝΔΕΣΗ ΜΕ ΤΟ ΑΡΧΕΙΟ ΔΕΝ ΕΙΝΑΙ ΔΙΑΘΕΣΙΜΗ", "error");
      empty.hidden = false; empty.textContent = e.message;
      notify(e.message);
    }
  }
  queueRender(); initialize();
})();