const controlsTemplate = document.getElementById('clip-controls');
const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;

function labelButton(button, label) {
  button.setAttribute('aria-label', label);
  button.title = label;
}

function restoreInlineScroll(position) {
  // Some browsers exit fullscreen before the window has finished resizing.
  const deadline = performance.now() + 1500;
  function restore(now) {
    if (fullscreenElement()) return;
    const resized = window.innerWidth === position.width && window.innerHeight === position.height;
    if (!resized && now < deadline) {
      requestAnimationFrame(restore);
      return;
    }
    window.scrollTo({ left: position.left, top: position.top, behavior: 'instant' });
  }
  requestAnimationFrame(restore);
}

for (const player of document.querySelectorAll('.film-player')) {
  const [nativeVideo, arliftVideo] = player.querySelectorAll('.film-video');
  const clips = [nativeVideo, arliftVideo];
  const filmTitle = player.closest('figure').querySelector('figcaption');
  arliftVideo.id = filmTitle.id.replace('-title', '-video');
  nativeVideo.id = filmTitle.id.replace('-title', '-native-video');
  const bar = controlsTemplate.content.firstElementChild.cloneNode(true);
  const play = bar.querySelector('.play-toggle');
  const seek = bar.querySelector('.seek');
  const full = bar.querySelector('.full-toggle');
  const name = filmTitle.textContent;
  bar.setAttribute('aria-label', name + ' controls');
  const targets = clips.map(clip => clip.id).join(' ');
  for (const element of [play, seek, full]) element.setAttribute('aria-controls', targets);
  seek.setAttribute('aria-label', 'Seek in ' + name);
  player.append(bar);

  let notice;
  function report(text) {
    if (!notice && text) {
      notice = document.createElement('p');
      notice.className = 'media-error';
      notice.setAttribute('role', 'status');
      player.after(notice);
    }
    if (notice) {
      notice.textContent = text;
      notice.hidden = !text;
    }
  }

  let playRequest = 0;

  function pausePair() {
    playRequest += 1;
    for (const clip of clips) clip.pause();
  }

  function seekPair(time) {
    for (const clip of clips) {
      clip.currentTime = Math.min(time, clip.duration);
    }
  }

  function alignNative(maxDrift = .08) {
    // Use the right-hand video as the clock and correct drift after a load delay.
    if (!Number.isFinite(nativeVideo.duration) || arliftVideo.seeking || nativeVideo.seeking) return;
    const target = Math.min(arliftVideo.currentTime, nativeVideo.duration);
    if (Math.abs(nativeVideo.currentTime - target) > maxDrift) nativeVideo.currentTime = target;
  }

  async function togglePlay() {
    if (!arliftVideo.paused) {
      pausePair();
      alignNative(0);
      return;
    }

    if (clips.some(clip => clip.ended)) seekPair(0);
    else alignNative(0);
    const request = ++playRequest;
    report('');
    try {
      await Promise.all(clips.map(clip => clip.play()));
      if (request === playRequest) alignNative();
    } catch (error) {
      if (request !== playRequest) return;
      pausePair();
      if (error.name !== 'AbortError') report('This comparison could not be played.');
    }
  }

  function updatePlay() {
    const playing = !arliftVideo.paused && !arliftVideo.ended;
    player.classList.toggle('is-playing', playing);
    labelButton(play, (playing ? 'Pause ' : 'Play ') + name);
  }

  const duration = () => Math.min(nativeVideo.duration, arliftVideo.duration);

  function updateTime() {
    const end = duration();
    seek.disabled = !Number.isFinite(end) || end <= 0;
    if (seek.disabled) return;
    seek.max = String(end);
    if (!dragging) seek.value = String(arliftVideo.currentTime);
    const time = Number(seek.value);
    seek.style.setProperty('--played', (100 * time / end) + '%');
    seek.setAttribute('aria-valuetext', time.toFixed(2) + ' of ' + end.toFixed(2) + ' seconds');
  }

  let dragging = false;
  seek.addEventListener('pointerdown', () => { dragging = true; });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) {
    seek.addEventListener(event, () => { dragging = false; });
  }
  seek.addEventListener('input', () => {
    if (seek.disabled) return;
    seekPair(Number(seek.value));
    updateTime();
  });

  let returnView = null;
  function updateFullscreen() {
    const inPlayer = fullscreenElement() === player;
    const leaving = player.classList.contains('in-fullscreen') && !inPlayer;
    player.classList.toggle('in-fullscreen', inPlayer);
    labelButton(full, (inPlayer ? 'Exit fullscreen for ' : 'Fullscreen for ') + name);
    if (leaving && returnView) {
      restoreInlineScroll(returnView);
      returnView = null;
    }
  }

  full.hidden = !(player.requestFullscreen || player.webkitRequestFullscreen);
  full.addEventListener('click', async () => {
    if (!fullscreenElement()) {
      returnView = {
        left: window.scrollX, top: window.scrollY,
        width: window.innerWidth, height: window.innerHeight
      };
    }
    try {
      if (fullscreenElement()) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else document.webkitExitFullscreen();
      } else if (player.requestFullscreen) {
        await player.requestFullscreen();
      } else if (player.webkitRequestFullscreen) {
        player.webkitRequestFullscreen();
      }
    } catch {
      returnView = null;
      report('Fullscreen is unavailable in this window.');
    }
  });

  play.addEventListener('click', togglePlay);
  for (const clip of clips) {
    for (const event of ['loadedmetadata', 'durationchange', 'seeked']) clip.addEventListener(event, updateTime);
    clip.addEventListener('click', togglePlay);
    clip.addEventListener('error', () => {
      pausePair();
      report(clip === nativeVideo ? 'The native-resolution video could not be opened.' : 'The ARLIFT video could not be opened.');
    });
    clip.controls = false;
  }
  for (const event of ['play', 'pause', 'ended', 'emptied']) arliftVideo.addEventListener(event, updatePlay);
  arliftVideo.addEventListener('timeupdate', () => {
    if (!arliftVideo.paused) alignNative();
    updateTime();
  });
  arliftVideo.addEventListener('ended', () => {
    pausePair();
    alignNative(0);
  });
  for (const event of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(event, updateFullscreen);

  updatePlay();
  updateTime();
  updateFullscreen();
}
