(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');

  // A translucent light follows the pointer without changing hit targets.
  if (finePointer.matches) {
    const canvas = document.createElement('canvas');
    canvas.className = 'cursor-light';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.append(canvas);
    const ctx = canvas.getContext('2d');
    let width = 0, height = 0, ratio = 1, raf = 0, lastMove = -Infinity;
    let target = { x: -200, y: -200 }, follower = { ...target };
    const trail = [];

    function resizeCursor() {
      ratio = Math.min(devicePixelRatio || 1, 2);
      width = innerWidth;
      height = innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    function halo(x, y, radius, strength) {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, `rgba(22, 88, 237, ${strength * .7})`);
      glow.addColorStop(.34, `rgba(70, 134, 255, ${strength * .32})`);
      glow.addColorStop(1, 'rgba(127, 184, 255, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    function paintCursor(now) {
      raf = 0;
      ctx.clearRect(0, 0, width, height);
      if (reduced.matches || document.hidden) return;
      const fade = Math.max(0, Math.min(1, (1400 - (now - lastMove)) / 700));
      if (!fade) { trail.length = 0; return; }
      follower.x += (target.x - follower.x) * .24;
      follower.y += (target.y - follower.y) * .24;
      trail.unshift({ x: follower.x, y: follower.y });
      if (trail.length > 15) trail.pop();
      for (let i = trail.length - 1; i >= 0; i--) {
        const age = i / trail.length;
        halo(trail[i].x, trail[i].y, 43 + 21 * (1 - age), fade * (.12 + (1 - age) * .32));
      }
      halo(follower.x, follower.y, 32, fade * .36);
      raf = requestAnimationFrame(paintCursor);
    }
    function onMove(event) {
      if (reduced.matches || event.pointerType === 'touch') return;
      target = { x: event.clientX, y: event.clientY };
      if (lastMove === -Infinity) follower = { ...target };
      lastMove = performance.now();
      if (!raf) raf = requestAnimationFrame(paintCursor);
    }
    resizeCursor();
    addEventListener('resize', resizeCursor, { passive: true });
    addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0; ctx.clearRect(0, 0, width, height); }
    });
    reduced.addEventListener('change', () => {
      if (reduced.matches) { cancelAnimationFrame(raf); raf = 0; ctx.clearRect(0, 0, width, height); }
    });
  }

  const canvas = document.querySelector('.contact-balls');
  if (!canvas) return;
  const section = canvas.closest('.contact-playground');
  const ctx = canvas.getContext('2d');
  const palette = [
    ['#e9f2ff', '#336ce0', '#10399f'],
    ['#f3f7ff', '#648ce4', '#2149ba'],
    ['#ffffff', '#e9edf6', '#a9b5cd'],
    ['#ffffff', '#e7e0d0', '#b8a482'],
    ['#f9f6ff', '#c4bbdb', '#8e83bb']
  ];
  let width = 0, height = 0, ratio = 1, balls = [], raf = 0, visible = false, previous = 0;
  let pointer = null;

  function boundaries() {
    const half = Math.min(width * .46, 385);
    return { left: width / 2 - half, right: width / 2 + half, top: height * .37, floor: height - 8 };
  }
  function makeBalls() {
    const mobile = width < 600;
    const rows = mobile ? [7, 6, 5, 4, 3, 2] : [11, 10, 9, 8, 7, 6, 4];
    const spacing = mobile ? Math.min(42, width / 8) : Math.min(58, width / 14);
    const rise = mobile ? 31 : 43;
    const floor = height - 9;
    balls = [];
    rows.forEach((count, row) => {
      for (let i = 0; i < count; i++) {
        const radius = (mobile ? 12 : 18) + Math.random() * (mobile ? 12 : 17);
        balls.push({
          x: width / 2 + (i - (count - 1) / 2) * spacing + (Math.random() - .5) * 10,
          y: floor - radius - row * rise + (Math.random() - .5) * 9,
          vx: (Math.random() - .5) * .7,
          vy: 0,
          r: radius,
          colors: palette[(row * 3 + i * 2) % palette.length]
        });
      }
    });
  }
  function resizeBalls() {
    const bounds = section.getBoundingClientRect();
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    makeBalls();
    drawBalls();
  }
  function collide(a, b) {
    let dx = b.x - a.x, dy = b.y - a.y;
    let distance = Math.hypot(dx, dy);
    const gap = a.r + b.r + .7;
    if (distance >= gap) return;
    if (distance < .001) { dx = 1; dy = 0; distance = 1; }
    const nx = dx / distance, ny = dy / distance;
    const overlap = (gap - distance) * .51;
    a.x -= nx * overlap; a.y -= ny * overlap;
    b.x += nx * overlap; b.y += ny * overlap;
    const approaching = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (approaching < 0) {
      const impulse = -approaching * .83;
      a.vx -= nx * impulse; a.vy -= ny * impulse;
      b.vx += nx * impulse; b.vy += ny * impulse;
    }
  }
  function physics(step) {
    const edge = boundaries();
    for (const ball of balls) {
      ball.vy += .17 * step;
      if (pointer) {
        const dx = ball.x - pointer.x, dy = ball.y - pointer.y;
        const distance = Math.hypot(dx, dy) || 1;
        const reach = ball.r + 75;
        if (distance < reach) {
          const force = (1 - distance / reach) * .8 * step;
          ball.vx += dx / distance * force;
          ball.vy += dy / distance * force;
        }
      }
      ball.vx *= .991; ball.vy *= .995;
      ball.x += ball.vx * step;
      ball.y += ball.vy * step;
    }
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < balls.length; i++)
        for (let j = i + 1; j < balls.length; j++) collide(balls[i], balls[j]);
      for (const ball of balls) {
        if (ball.x - ball.r < edge.left) { ball.x = edge.left + ball.r; ball.vx = Math.abs(ball.vx) * .68; }
        if (ball.x + ball.r > edge.right) { ball.x = edge.right - ball.r; ball.vx = -Math.abs(ball.vx) * .68; }
        if (ball.y - ball.r < edge.top) { ball.y = edge.top + ball.r; ball.vy = Math.abs(ball.vy) * .6; }
        if (ball.y + ball.r > edge.floor) { ball.y = edge.floor - ball.r; ball.vy = -Math.abs(ball.vy) * .62; if (Math.abs(ball.vy) < .28) ball.vy = 0; }
      }
    }
  }
  function drawBalls() {
    ctx.clearRect(0, 0, width, height);
    for (const ball of [...balls].sort((a, b) => a.y - b.y)) {
      const { x, y, r, colors } = ball;
      ctx.save();
      ctx.shadowColor = 'rgba(38, 63, 130, .22)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 6;
      const fill = ctx.createRadialGradient(x - r * .32, y - r * .42, r * .03, x + r * .13, y + r * .18, r * 1.15);
      fill.addColorStop(0, colors[0]);
      fill.addColorStop(.45, colors[1]);
      fill.addColorStop(1, colors[2]);
      ctx.fillStyle = fill;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = 'rgba(255,255,255,.64)';
      ctx.lineWidth = 1.15;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.48)';
      ctx.beginPath(); ctx.ellipse(x - r * .3, y - r * .36, r * .25, r * .12, -.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
  function animate(now) {
    raf = 0;
    if (!visible || reduced.matches || document.hidden) return;
    const step = Math.min(1.7, Math.max(.5, (now - (previous || now - 16.7)) / 16.7));
    previous = now;
    physics(step);
    drawBalls();
    raf = requestAnimationFrame(animate);
  }
  function start() {
    if (!raf && visible && !reduced.matches && !document.hidden) {
      previous = 0;
      raf = requestAnimationFrame(animate);
    }
  }
  function stop() { cancelAnimationFrame(raf); raf = 0; }
  section.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') return;
    const bounds = section.getBoundingClientRect();
    pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }, { passive: true });
  section.addEventListener('pointerleave', () => { pointer = null; });
  new ResizeObserver(resizeBalls).observe(section);
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) start(); else stop();
  }, { threshold: .05 });
  observer.observe(section);
  reduced.addEventListener('change', () => { if (reduced.matches) { stop(); drawBalls(); } else start(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });
})();
