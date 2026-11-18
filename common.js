const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function api(url, opts) {
  const r = await fetch(url, opts);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}
function applyChrome(s) {
  const logo = $('#logo');
  if (logo) logo.innerHTML = `${esc(s.siteName)}<small>${esc(s.tagline)}</small>`;
  const copy = $('#copy'); if (copy) copy.textContent = `${new Date().getFullYear()} ${s.siteName}`;
  const ig = $('#ig'); if (ig) { if (s.instagram) ig.href = s.instagram; else ig.remove(); }
  const mb = $('#menuBtn'), nav = $('#nav');
  mb && mb.addEventListener('click', () => nav.classList.toggle('open'));
  nav && nav.addEventListener('click', (e) => e.target.closest('a') && nav.classList.remove('open'));
}
