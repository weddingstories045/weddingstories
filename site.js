(async function () {
  let data;
  try { data = await api('/api/site'); } catch (e) { document.body.innerHTML = '<p style="padding:40px">Could not load site.</p>'; return; }
  const { settings: s, stories } = data;
  document.title = `Weddings | ${s.siteName}`;
  applyChrome(s);
  $('#heroTitle').textContent = s.heroTitle;
  $('#heroText').textContent = s.heroText;
  $('#heroQuote').textContent = s.heroQuote;
  $('#storiesHeading').textContent = s.storiesHeading;

  // hero strip from story covers
  const strip = $('#strip');
  strip.innerHTML = stories.length
    ? stories.slice(0, 6).map((st) => `<a href="/story/${st.slug}" title="${esc(st.title)}"><img src="${st.cover}" alt="${esc(st.title)}" loading="eager"></a>`).join('')
    : '<div class="empty">Add your first story in /admin</div>';

  // story list
  $('#storyList').innerHTML = stories.length
    ? stories.map((st) => `
      <article class="story">
        <a class="pic" href="/story/${st.slug}"><img src="${st.cover}" alt="${esc(st.title)}" loading="lazy"></a>
        <div class="cap">
          <h2><a href="/story/${st.slug}">${esc(st.title)}</a></h2>
          ${st.location ? `<div class="loc">// ${esc(st.location)} //</div>` : ''}
          <a class="more" href="/story/${st.slug}">View story</a>
        </div>
      </article>`).join('')
    : '<p class="none">No stories published yet.</p>';

  // about
  const about = $('#about-in');
  if (s.aboutImage) about.innerHTML = `<div class="ph"><img src="${esc(s.aboutImage)}" alt="${esc(s.siteName)}" loading="lazy"></div><div><h2>${esc(s.aboutTitle)}</h2><p>${esc(s.aboutText)}</p></div>`;
  else { about.classList.add('noimg'); about.innerHTML = `<div><h2>${esc(s.aboutTitle)}</h2><p>${esc(s.aboutText)}</p></div>`; }

  // contact line
  $('#contactLine').innerHTML = [s.email && `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>`, s.phone && esc(s.phone)].filter(Boolean).join(' &nbsp;&middot;&nbsp; ');

  // enquiry form
  $('#enqForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#enqMsg'); msg.className = 'msg'; msg.textContent = 'Sending...';
    try {
      await api('/api/enquire', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(e.target))) });
      msg.className = 'msg ok'; msg.textContent = 'Thank you! Your enquiry has been sent.'; e.target.reset();
    } catch (err) { msg.className = 'msg err'; msg.textContent = err.message; }
  });

  // highlight nav on scroll
  const links = [...document.querySelectorAll('#nav a')];
  addEventListener('scroll', () => {
    let cur = links[0];
    for (const a of links) { const id = a.getAttribute('href'); if (id.startsWith('#')) { const el = $(id); if (el && el.getBoundingClientRect().top < 160) cur = a; } }
    links.forEach((a) => a.classList.toggle('on', a === cur));
  }, { passive: true });
})();
