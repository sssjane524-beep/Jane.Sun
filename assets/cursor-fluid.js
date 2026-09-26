(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  if (!fine.matches || reduced.matches) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'cursor-light';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  document.body.append(canvas);
  const lifetime = 180;
  let points = [], frame = 0;
  function stop() {
    cancelAnimationFrame(frame); frame = 0; points = [];
    ctx.clearRect(0, 0, innerWidth, innerHeight);
  }
  function resize() {
    stop();
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(innerWidth * ratio);
    canvas.height = Math.round(innerHeight * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  function paint(now) {
    frame = 0;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    points = points.filter(p => now - p.time < lifetime);
    if (points.length < 2) return;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = 8; ctx.filter = 'blur(5px)';
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const fade = Math.max(0, 1 - (now - a.time) / lifetime);
      ctx.strokeStyle = `rgba(95, 143, 235, ${fade * .16})`;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.filter = 'none';
    frame = requestAnimationFrame(paint);
  }
  addEventListener('pointermove', event => {
    if (reduced.matches || !fine.matches || event.pointerType === 'touch') return;
    const now = performance.now(), last = points.at(-1);
    if (last && now - last.time > lifetime) points = [];
    if (last && last.x === event.clientX && last.y === event.clientY) return;
    points.push({ x: event.clientX, y: event.clientY, time: now });
    if (points.length > 32) points.shift();
    if (!frame) frame = requestAnimationFrame(paint);
  }, { passive: true });
  addEventListener('resize', resize, { passive: true });
  addEventListener('blur', stop);
  document.documentElement.addEventListener('pointerleave', stop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  reduced.addEventListener('change', stop);
  fine.addEventListener('change', stop);
  resize();
})();
