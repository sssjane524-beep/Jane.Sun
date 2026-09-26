(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const canvas = document.querySelector('.contact-balls');
  if (!canvas) return;
  const section = canvas.closest('.contact-playground');
  const ctx = canvas.getContext('2d');
  const palette = [
    ['#ffffff', '#8db8ff', '#2258cc', '#092b81'],
    ['#ffffff', '#b9d3ff', '#4879dc', '#15398f'],
    ['#ffffff', '#f2f6ff', '#b0bfd9', '#6b789c'],
    ['#ffffff', '#f5ebd5', '#c2ad86', '#887457'],
    ['#ffffff', '#e8ddfa', '#aa95d1', '#69578f']
  ];
  let width = 0, height = 0, ratio = 1, balls = [], raf = 0, visible = false, previous = 0;
  let pointer = null;

  function boundaries() {
    return { left: 3, right: width - 3, top: height * .42, floor: height - 8 };
  }
  function makeBalls() {
    const mobile = width < 600;
    const radius = mobile ? Math.max(13, Math.min(18, width / 24)) : Math.max(20, Math.min(33, width / 39));
    const columns = Math.max(7, Math.ceil(width / (radius * 2.02)));
    const rows = mobile ? 5 : 7;
    const spacing = width / columns;
    const rise = radius * 1.58;
    const floor = height - 9;
    balls = [];
    for (let row = 0; row < rows; row++) {
      const count = Math.max(3, columns - row * 2);
      for (let i = 0; i < count; i++) {
        const size = radius * (.77 + Math.random() * .35);
        balls.push({
          x: width / 2 + (i - (count - 1) / 2) * spacing + (Math.random() - .5) * 8,
          y: floor - size - row * rise + (Math.random() - .5) * 8,
          vx: (Math.random() - .5) * .7,
          vy: 0,
          r: size,
          colors: palette[(row * 3 + i * 2) % palette.length]
        });
      }
    }
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
    const gap = a.r + b.r + .7;
    if (Math.abs(dx) >= gap || Math.abs(dy) >= gap) return;
    let distance = Math.hypot(dx, dy);
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
      ctx.fillStyle = 'rgba(31, 51, 109, .11)';
      ctx.beginPath(); ctx.ellipse(x + r * .15, y + r * .78, r * .9, r * .3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.shadowColor = 'rgba(30, 57, 124, .29)';
      ctx.shadowBlur = r * .55;
      ctx.shadowOffsetY = r * .22;
      const fill = ctx.createRadialGradient(x - r * .42, y - r * .53, r * .05, x + r * .24, y + r * .27, r * 1.24);
      fill.addColorStop(0, colors[0]);
      fill.addColorStop(.31, colors[1]);
      fill.addColorStop(.72, colors[2]);
      fill.addColorStop(1, colors[3]);
      ctx.fillStyle = fill;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = 'rgba(20,43,101,.22)';
      ctx.lineWidth = 1.35;
      ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, r - 2, Math.PI * 1.04, Math.PI * 1.82);
      ctx.strokeStyle = 'rgba(255,255,255,.56)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, r - 1, 0, Math.PI * 2); ctx.clip();
      const reflection = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
      reflection.addColorStop(0, 'rgba(255,255,255,.76)');
      reflection.addColorStop(.52, 'rgba(255,255,255,.08)');
      reflection.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = reflection;
      ctx.beginPath(); ctx.ellipse(x - r * .25, y - r * .55, r * .66, r * .3, -.45, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.78)';
      ctx.beginPath(); ctx.ellipse(x - r * .39, y - r * .47, r * .16, r * .075, -.5, 0, Math.PI * 2); ctx.fill();
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
