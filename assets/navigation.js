(() => {
  const nav = document.querySelector('.article-nav');
  const chapters = Array.from(nav.querySelectorAll('a'), link => ({
    link,
    section: document.getElementById(link.hash.slice(1))
  }));
  let scheduled = false;

  function markChapter() {
    const readingLine = nav.offsetHeight + Math.min(100, window.innerHeight * .16);
    let current;
    for (const chapter of chapters) {
      if (chapter.section.getBoundingClientRect().top > readingLine) break;
      current = chapter;
    }
    for (const chapter of chapters) {
      if (chapter === current) chapter.link.setAttribute('aria-current', 'location');
      else chapter.link.removeAttribute('aria-current');
    }
    scheduled = false;
  }

  function scheduleUpdate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(markChapter);
  }

  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate);
  window.addEventListener('pageshow', scheduleUpdate);
  markChapter();

  document.querySelectorAll('.copy-bibtex').forEach(btn => {
    btn.addEventListener('click', async () => {
      const target = document.getElementById(btn.dataset.copyTarget);
      if (!target) return;
      const text = target.textContent.trim();
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.className = 'copy-fallback';
        ta.setAttribute('readonly', '');
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      const prev = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = prev; }, 1800);
    });
  });
})();
