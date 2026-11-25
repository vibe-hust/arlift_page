(() => {
  const zoom = 2.5;
  const posters = new WeakMap();
  const lenses = Array.from({ length: 2 }, () => {
    const canvas = document.createElement('canvas');
    canvas.className = 'media-lens';
    canvas.setAttribute('aria-hidden', 'true');
    return { canvas, context: canvas.getContext('2d') };
  });
  if (lenses.some(lens => !lens.context)) return;

  let active;
  let animation = 0;

  function schedule() {
    if (active && !animation) animation = requestAnimationFrame(paint);
  }

  function dismiss() {
    if (!active) return;
    active = undefined;
    cancelAnimationFrame(animation);
    animation = 0;
    for (const { canvas } of lenses) canvas.remove();
  }

  function imageFrame(image) {
    if (image.complete && image.naturalWidth) {
      return { image, width: image.naturalWidth, height: image.naturalHeight };
    }
  }

  function posterFrame(media) {
    if (!posters.has(media)) {
      const poster = new Image();
      poster.addEventListener('load', schedule, { once: true });
      poster.src = media.poster;
      posters.set(media, poster);
    }
    return imageFrame(posters.get(media));
  }

  function sourceFrame(media) {
    if (media instanceof HTMLImageElement) return imageFrame(media);
    if (media.error || media.seeking) return;
    // Browsers can report current video data while still displaying the poster.
    if (media.currentTime === 0 && media.poster) return posterFrame(media);
    if (media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && media.videoWidth) {
      return { image: media, width: media.videoWidth, height: media.videoHeight };
    }
  }

  function measure(surface, media) {
    const bounds = surface.getBoundingClientRect();
    let { left, top, width, height } = media.getBoundingClientRect();
    if (media instanceof HTMLVideoElement) {
      // object-fit: contain can leave bars around the picture in fullscreen.
      const aspect = (media.videoWidth || media.width) / (media.videoHeight || media.height);
      const pictureWidth = Math.min(width, height * aspect);
      const pictureHeight = Math.min(height, width / aspect);
      left += (width - pictureWidth) / 2;
      top += (height - pictureHeight) / 2;
      width = pictureWidth;
      height = pictureHeight;
    }
    return {
      bounds, left, top, width, height,
      clipLeft: Math.max(left, bounds.left),
      clipTop: Math.max(top, bounds.top),
      clipRight: Math.min(left + width, bounds.right),
      clipBottom: Math.min(top + height, bounds.bottom)
    };
  }

  function draw(lens, geometry, frame, x, y, limit) {
    const { canvas, context } = lens;
    const { bounds, left, top, width, height, clipLeft, clipTop, clipRight, clipBottom } = geometry;
    const size = Math.min(limit, clipRight - clipLeft, clipBottom - clipTop);
    if (!frame || size <= 0) {
      canvas.hidden = true;
      return;
    }

    const anchorX = left + x * width;
    const anchorY = top + y * height;
    const lensLeft = Math.max(clipLeft, Math.min(anchorX - size / 2, clipRight - size));
    const lensTop = Math.max(clipTop, Math.min(anchorY - size / 2, clipBottom - size));
    const pixels = Math.ceil(size * devicePixelRatio);
    if (canvas.width !== pixels || canvas.height !== pixels) {
      canvas.width = pixels;
      canvas.height = pixels;
    }
    canvas.style.left = lensLeft - bounds.left + 'px';
    canvas.style.top = lensTop - bounds.top + 'px';
    canvas.style.width = canvas.style.height = size + 'px';

    const sourceX = (anchorX - left + (lensLeft - anchorX) / zoom) * frame.width / width;
    const sourceY = (anchorY - top + (lensTop - anchorY) / zoom) * frame.height / height;
    const sourceWidth = size * frame.width / (width * zoom);
    const sourceHeight = size * frame.height / (height * zoom);
    // The two canvases are reused across comparisons, so replace their pixels every time.
    context.clearRect(0, 0, pixels, pixels);
    context.drawImage(frame.image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, pixels, pixels);
    canvas.hidden = false;
  }

  function paint() {
    animation = 0;
    const { views, selected, clientX, clientY, isVideo } = active;
    const geometry = views.map(({ surface, media }) => measure(surface, media));
    const reference = geometry[selected];
    if (clientX < reference.clipLeft || clientX > reference.clipRight ||
        clientY < reference.clipTop || clientY > reference.clipBottom) {
      dismiss();
      return;
    }
    const x = (clientX - reference.left) / reference.width;
    const y = (clientY - reference.top) / reference.height;
    views.forEach(({ media }, index) => {
      draw(lenses[index], geometry[index], sourceFrame(media), x, y, isVideo ? 180 : 116);
    });
    if (isVideo && views.some(({ media }) => !media.paused && !media.ended)) schedule();
  }

  document.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse') return;
    const surface = event.target.closest('.frame-view, .film-picture');
    if (!surface) {
      dismiss();
      return;
    }
    if (surface !== active?.surface) {
      dismiss();
      const comparison = surface.closest('.film-comparison');
      const surfaces = comparison ? Array.from(comparison.querySelectorAll('.film-picture')) : [surface];
      const views = surfaces.map((pane, index) => {
        const media = pane.querySelector('img, video');
        const { canvas } = lenses[index];
        canvas.hidden = true;
        pane.append(canvas);
        return { surface: pane, media };
      });
      active = { surface, views, selected: surfaces.indexOf(surface), isVideo: Boolean(comparison) };
    }
    active.clientX = event.clientX;
    active.clientY = event.clientY;
    schedule();
  });

  for (const event of ['load', 'loadeddata', 'play', 'pause', 'seeking', 'seeked', 'ended', 'error', 'click']) {
    document.addEventListener(event, schedule, true);
  }
  document.documentElement.addEventListener('pointerleave', dismiss);
  document.addEventListener('pointercancel', dismiss);
  document.addEventListener('fullscreenchange', dismiss);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') dismiss();
  });
  window.addEventListener('blur', dismiss);
  window.addEventListener('resize', dismiss);
  window.addEventListener('scroll', dismiss, { capture: true, passive: true });
})();
