const view = $('#view');
let tab = 'stories';
const J = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
function toast(msg, err) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = 'toast'), 2600);
}
const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { if (/Not logged in/.test(e.message)) return boot(); toast(e.message, true); } };

// ---------- auth ----------
async function boot() {
  const me = await api('/api/me');
  $('#login').hidden = me.admin; $('#app').hidden = !me.admin;
  if (me.admin) { refreshEnqCount(); render(); }
}
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await api('/api/login', J('POST', { password: $('#pw').value })); $('#pw').value = ''; $('#loginErr').textContent = ''; boot(); }
  catch (err) { $('#loginErr').textContent = err.message; }
});
$('#logout').onclick = async () => { await api('/api/logout', { method: 'POST' }); boot(); };
document.querySelectorAll('aside [data-tab]').forEach((b) => (b.onclick = () => {
  tab = b.dataset.tab; document.querySelectorAll('aside [data-tab]').forEach((x) => x.classList.toggle('on', x === b)); render();
}));
async function refreshEnqCount() {
  try { const { enquiries } = await api('/api/admin/enquiries'); const p = $('#enqCount'); p.hidden = !enquiries.length; p.textContent = enquiries.length; } catch (_) {}
}
const render = guard(async () => { ({ stories: renderStories, settings: renderSettings, enquiries: renderEnquiries })[tab](); });

// ---------- stories list ----------
const renderStories = guard(async () => {
  const { stories } = await api('/api/admin/stories');
  view.innerHTML = `
    <div class="bar"><div><h2>Stories</h2><div class="sub">Each story is a folder of images shown on your site.</div></div>
      <button class="btn" id="newBtn">+ New story</button></div>
    <div class="panel" id="newPanel" hidden>
      <div class="row2"><div><label>Title (e.g. Trisha x Nihaal) *</label><input id="nTitle"></div><div><label>Location</label><input id="nLoc" placeholder="Hyderabad"></div></div>
      <div class="row2"><div><label>Date</label><input id="nDate" placeholder="May 2021"></div><div></div></div>
      <label>Short description</label><textarea id="nDesc"></textarea>
      <div style="margin-top:14px"><button class="btn" id="createBtn">Create &amp; add photos</button> <button class="btn ghost" id="cancelNew">Cancel</button></div>
    </div>
    ${stories.length ? '<div class="cards" id="cards"></div><div class="hint">Drag cards to change the order they appear on the site.</div>' : '<div class="panel">No stories yet. Click "New story" to begin.</div>'}`;
  $('#newBtn').onclick = () => { $('#newPanel').hidden = false; $('#nTitle').focus(); };
  $('#cancelNew').onclick = () => ($('#newPanel').hidden = true);
  $('#createBtn').onclick = guard(async () => {
    const { story } = await api('/api/admin/stories', J('POST', { title: $('#nTitle').value, location: $('#nLoc').value, date: $('#nDate').value, description: $('#nDesc').value }));
    toast('Story created'); openStory(story.id);
  });
  const box = $('#cards'); if (!box) return;
  box.innerHTML = stories.map((s) => `<div class="card" draggable="true" data-id="${s.id}">
      <span class="badge ${s.published ? '' : 'draft'}">${s.published ? 'Published' : 'Draft'}</span>
      <div class="th" style="${s.cover ? `background-image:url('${s.cover}')` : ''}">${s.cover ? '' : 'No photos yet'}</div>
      <div class="info"><b>${esc(s.title)}</b><small>${esc(s.location || '')}${s.location ? ' &middot; ' : ''}${s.count} photo${s.count === 1 ? '' : 's'}</small></div></div>`).join('');
  makeSortable(box, '.card', guard(async (ids) => { await api('/api/admin/stories-order', J('PUT', { order: ids })); toast('Order saved'); }), (el) => el.dataset.id, (e) => openStory(e.dataset.id));
});

// ---------- drag-sort helper ----------
function makeSortable(box, sel, onSave, getId, onClick) {
  let dragged = null;
  box.addEventListener('dragstart', (e) => { dragged = e.target.closest(sel); if (!dragged) return; dragged.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'x'); });
  box.addEventListener('dragend', () => { if (dragged) dragged.classList.remove('drag'); box.querySelectorAll('.target').forEach((x) => x.classList.remove('target')); dragged = null; });
  box.addEventListener('dragover', (e) => {
    if (!dragged) return; e.preventDefault();
    const over = e.target.closest(sel); if (!over || over === dragged) return;
    const r = over.getBoundingClientRect();
    const after = (e.clientX - r.left) / r.width > 0.5 || (e.clientY - r.top) / r.height > 0.85;
    box.insertBefore(dragged, after ? over.nextSibling : over);
  });
  box.addEventListener('drop', (e) => { if (!dragged) return; e.preventDefault(); onSave([...box.querySelectorAll(sel)].map(getId)); });
  if (onClick) box.addEventListener('click', (e) => { const el = e.target.closest(sel); if (el && !e.target.closest('button,input')) onClick(el); });
}

// ---------- single story ----------
let current = null;
const openStory = guard(async (id) => {
  const { story } = await api('/api/admin/stories/' + id); current = story; drawStory();
});
function drawStory() {
  const s = current;
  view.innerHTML = `
    <button class="back" id="back">&larr; All stories</button>
    <div class="bar"><div><h2>${esc(s.title)}</h2><div class="sub"><a href="/story/${s.slug}" target="_blank">/story/${esc(s.slug)}</a></div></div>
      <div><button class="btn ghost" id="pubBtn">${s.published ? 'Unpublish' : 'Publish'}</button> <button class="btn danger" id="delStory">Delete story</button></div></div>
    <div class="panel">
      <div class="row2"><div><label>Title</label><input id="fTitle" value="${esc(s.title)}"></div><div><label>Location</label><input id="fLoc" value="${esc(s.location)}"></div></div>
      <div class="row2"><div><label>Date</label><input id="fDate" value="${esc(s.date)}"></div><div></div></div>
      <label>Description</label><textarea id="fDesc">${esc(s.description)}</textarea>
      <div style="margin-top:14px"><button class="btn" id="saveBtn">Save details</button></div>
    </div>
    <div class="panel">
      <h3 style="margin-bottom:12px">Photos (${s.images.length})</h3>
      <div class="drop" id="drop">Drag &amp; drop photos here, or click to choose<input type="file" id="file" accept="image/*" multiple hidden></div>
      <div class="progress" id="prog" hidden><i></i></div>
      <div class="grid" id="grid"></div>
      <div class="hint">Drag photos to reorder &middot; &#9733; sets the cover image &middot; add optional captions.</div>
    </div>`;
  $('#back').onclick = () => renderStories();
  $('#saveBtn').onclick = guard(async () => {
    const { story } = await api('/api/admin/stories/' + s.id, J('PUT', { title: $('#fTitle').value, location: $('#fLoc').value, date: $('#fDate').value, description: $('#fDesc').value }));
    current = story; toast('Saved'); drawStory();
  });
  $('#pubBtn').onclick = guard(async () => { const { story } = await api('/api/admin/stories/' + s.id, J('PUT', { published: !s.published })); current = story; toast(story.published ? 'Published' : 'Unpublished'); drawStory(); });
  $('#delStory').onclick = guard(async () => {
    if (!confirm(`Delete "${s.title}" and all ${s.images.length} photos? This cannot be undone.`)) return;
    await api('/api/admin/stories/' + s.id, { method: 'DELETE' }); toast('Story deleted'); renderStories();
  });
  drawGrid(); setupUpload();
}
function drawGrid() {
  const s = current, grid = $('#grid');
  grid.innerHTML = s.images.map((im) => `<div class="img" draggable="true" data-id="${im.id}">
      ${im.id === s.coverId ? '<span class="star">&#9733; Cover</span>' : ''}
      <img src="${im.url}" alt="" loading="lazy" draggable="false">
      <input placeholder="Caption (optional)" value="${esc(im.caption)}" data-cap="${im.id}">
      <div class="tools"><button data-cover="${im.id}" title="Set as cover">&#9733;</button><button data-del="${im.id}" title="Delete">&#128465;</button></div></div>`).join('');
  grid.onclick = guard(async (e) => {
    const c = e.target.closest('[data-cover]'), d = e.target.closest('[data-del]');
    if (c) { const { story } = await api('/api/admin/stories/' + s.id, J('PUT', { cover: c.dataset.cover })); current = story; drawGrid(); toast('Cover updated'); }
    if (d) { if (!confirm('Delete this photo?')) return; const { story } = await api(`/api/admin/stories/${s.id}/images/${d.dataset.del}`, { method: 'DELETE' }); current = story; drawStory(); toast('Photo deleted'); }
  });
  grid.onchange = guard(async (e) => { const i = e.target.closest('[data-cap]'); if (i) { await api(`/api/admin/stories/${s.id}/images/${i.dataset.cap}`, J('PUT', { caption: i.value })); toast('Caption saved'); } });
  makeSortable(grid, '.img', guard(async (ids) => { const { story } = await api(`/api/admin/stories/${s.id}/order`, J('PUT', { order: ids })); current = story; toast('Order saved'); }), (el) => el.dataset.id);
}
function setupUpload() {
  const drop = $('#drop'), file = $('#file');
  drop.onclick = () => file.click();
  file.onchange = () => upload([...file.files]);
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => upload([...e.dataTransfer.files]));
}
// upload in small batches so big shoots don't hit request limits
async function upload(files) {
  files = files.filter((f) => f.type.startsWith('image/'));
  if (!files.length) return toast('No image files selected', true);
  const prog = $('#prog'), bar = $('i', prog); prog.hidden = false; bar.style.width = '0';
  let done = 0, rejected = [];
  try {
    for (let i = 0; i < files.length; i += 5) {
      const batch = files.slice(i, i + 5), fd = new FormData();
      batch.forEach((f) => fd.append('images', f, f.name));
      const r = await fetch(`/api/admin/stories/${current.id}/images`, { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Upload failed');
      current = d.story; rejected.push(...d.rejected); done += batch.length;
      bar.style.width = (done / files.length) * 100 + '%';
    }
    toast(`Uploaded ${files.length - rejected.length} photo(s)` + (rejected.length ? `, skipped ${rejected.length}` : ''), rejected.length > 0);
  } catch (e) { toast(e.message, true); }
  drawStory();
}

// ---------- settings ----------
const SETTING_FIELDS = [
  ['siteName', 'Site / photographer name'], ['tagline', 'Tagline (under logo)'], ['heroTitle', 'Home headline'], ['heroText', 'Home intro paragraph', 'ta'],
  ['heroQuote', 'Highlighted quote'], ['storiesHeading', 'Stories section heading'], ['aboutTitle', 'About title'], ['aboutText', 'About text', 'ta'],
  ['email', 'Contact email'], ['phone', 'Phone'], ['instagram', 'Instagram URL'],
];
const renderSettings = guard(async () => {
  const { settings: s } = await api('/api/admin/settings');
  view.innerHTML = `<h2>Site settings</h2><div class="sub">Text shown on your public website.</div>
    <div class="panel">${SETTING_FIELDS.map(([k, l, t]) => `<label>${l}</label>${t ? `<textarea data-k="${k}">${esc(s[k])}</textarea>` : `<input data-k="${k}" value="${esc(s[k])}">`}`).join('')}
    <div style="margin-top:16px"><button class="btn" id="saveSet">Save settings</button></div></div>
    <div class="panel"><h3>About photo</h3>${s.aboutImage ? `<img src="${s.aboutImage}" style="max-width:220px;border-radius:8px;margin:12px 0;display:block">` : '<p class="hint">No photo set.</p>'}
    <input type="file" id="aboutFile" accept="image/*" style="margin-top:10px"></div>`;
  $('#saveSet').onclick = guard(async () => {
    const body = {}; document.querySelectorAll('[data-k]').forEach((el) => (body[el.dataset.k] = el.value));
    await api('/api/admin/settings', J('PUT', body)); toast('Settings saved');
  });
  $('#aboutFile').onchange = guard(async (e) => {
    const fd = new FormData(); fd.append('image', e.target.files[0]);
    const r = await fetch('/api/admin/about-image', { method: 'POST', body: fd }); const d = await r.json();
    if (!r.ok) throw new Error(d.error); toast('About photo updated'); renderSettings();
  });
});

// ---------- enquiries ----------
const renderEnquiries = guard(async () => {
  const { enquiries } = await api('/api/admin/enquiries');
  view.innerHTML = `<h2>Enquiries</h2><div class="sub">Messages from your contact form.</div><div class="panel">${enquiries.length ? enquiries.map((e) => `
    <div class="eq"><h4><span>${esc(e.name)} &middot; <a href="mailto:${esc(e.email)}">${esc(e.email)}</a></span><button class="btn danger sm" data-del="${e.id}">Delete</button></h4>
    <small>${new Date(e.createdAt).toLocaleString()}${e.phone ? ' &middot; ' + esc(e.phone) : ''}${e.date ? ' &middot; ' + esc(e.date) : ''}${e.location ? ' &middot; ' + esc(e.location) : ''}</small><p>${esc(e.message)}</p></div>`).join('') : 'No enquiries yet.'}</div>`;
  view.onclick = guard(async (ev) => { const d = ev.target.closest('[data-del]'); if (d && tab === 'enquiries' && confirm('Delete this enquiry?')) { await api('/api/admin/enquiries/' + d.dataset.del, { method: 'DELETE' }); renderEnquiries(); refreshEnqCount(); } });
});

boot();
