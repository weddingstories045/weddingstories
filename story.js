(async function () {
  const slug = location.pathname.split('/').filter(Boolean)[1];
  const main = $('#main');
  let d;
  try { d = await api('/api/stories/' + encodeURIComponent(slug || '')); }
  catch (e) { main.innerHTML = '<div class="story-head"><h1>Not found</h1><p><a href="/">Back home</a></p></div>'; return; }
  const { story: st, settings: s, next } = d;
  applyChrome(s);
  document.title = `${st.title} | ${s.siteName}`;
  const meta = [st.location, st.date].filter(Boolean).map(esc).join(' &nbsp;//&nbsp; ');
  main.innerHTML = `
    <div class="story-head"><h1>${esc(st.title)}</h1>${meta ? `<div class="meta">${meta}</div>` : ''}${st.description ? `<p>${esc(st.description)}</p>` : ''}</div>
    <div class="wrap"><div class="gallery" id="gal">${st.images.map((im, i) => `<figure data-i="${i}"><img src="${im.url}" alt="${esc(im.caption || st.title)}" loading="${i < 4 ? 'eager' : 'lazy'}"></figure>`).join('')}</div></div>
    ${next && next.slug !== st.slug ? `<div class="next"><small>Next story</small><a href="/story/${next.slug}">${esc(next.title)} &rarr;</a></div>` : ''}`;
  document.querySelectorAll('.gallery img').forEach((im) => { im.complete ? im.classList.add('loaded') : im.addEventListener('load', () => im.classList.add('loaded')); });

  // lightbox
  const lb = $('#lb'), lbImg = $('img', lb), cap = $('.c', lb); let i = 0;
  const show = (n) => { i = (n + st.images.length) % st.images.length; lbImg.src = st.images[i].url; cap.textContent = `${i + 1} / ${st.images.length}${st.images[i].caption ? '  —  ' + st.images[i].caption : ''}`; };
  const open = (n) => { show(n); lb.classList.add('open'); document.body.style.overflow = 'hidden'; };
  const close = () => { lb.classList.remove('open'); document.body.style.overflow = ''; };
  $('#gal').addEventListener('click', (e) => { const f = e.target.closest('figure'); if (f) open(+f.dataset.i); });
  $('.x', lb).onclick = close; $('.p', lb).onclick = () => show(i - 1); $('.n', lb).onclick = () => show(i + 1);
  lb.addEventListener('click', (e) => { if (e.target === lb) close(); });
  addEventListener('keydown', (e) => { if (!lb.classList.contains('open')) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft') show(i - 1); if (e.key === 'ArrowRight') show(i + 1); });
  let sx = 0; lb.addEventListener('touchstart', (e) => (sx = e.touches[0].clientX), { passive: true });
  lb.addEventListener('touchend', (e) => { const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) show(i + (dx < 0 ? 1 : -1)); });
})();
