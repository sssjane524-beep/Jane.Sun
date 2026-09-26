(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = matchMedia('(hover: hover) and (pointer: fine)');
  if (!pointer.matches) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'cursor-light';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  let gl;
  try {
    gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, depth: false, antialias: false });
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) throw new Error('Float buffers unavailable');
    fluid();
  } catch {
    canvas.remove();
    ribbonFallback();
  }

  // Incompressible flow: advect velocity/dye, add curl, solve pressure, project.
  function fluid() {
    const vertex = `#version 300 es
      in vec2 position; out vec2 uv;
      void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
    const common = `#version 300 es
      precision highp float; precision highp sampler2D;
      in vec2 uv; out vec4 color;
      uniform sampler2D source, velocity, auxiliary;
      uniform vec2 pixel, sourcePixel;
      uniform float dt, decay, amount;
      vec4 linearSample(sampler2D t,vec2 p,vec2 stepSize){
        vec2 q=p/stepSize-.5, f=fract(q), b=(floor(q)+.5)*stepSize;
        return mix(mix(texture(t,b),texture(t,b+vec2(stepSize.x,0.)),f.x),
          mix(texture(t,b+vec2(0.,stepSize.y)),texture(t,b+stepSize),f.x),f.y);
      }`;
    function program(body) {
      const shaders = [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, common + body]].map(([type, code]) => {
        const shader = gl.createShader(type); gl.shaderSource(shader, code); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Fluid shader compilation failed');
        return shader;
      });
      const p = gl.createProgram(); shaders.forEach(s => gl.attachShader(p, s)); gl.linkProgram(p);
      shaders.forEach(s => gl.deleteShader(s));
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Fluid linking failed');
      const uniforms = {};
      for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) {
        const name = gl.getActiveUniform(p, i).name; uniforms[name] = gl.getUniformLocation(p, name);
      }
      return { p, uniforms };
    }
    const shaders = {
      advect: program(`void main(){vec2 back=uv-dt*texture(velocity,uv).xy*pixel;
        color=linearSample(source,back,sourcePixel)*decay;}`),
      splat: program(`uniform vec2 point;uniform vec3 impulse;uniform float aspect;
        void main(){vec2 d=uv-point;d.x*=aspect;
        color=texture(source,uv)+vec4(impulse*exp(-dot(d,d)/amount),0.);}`),
      curl: program(`void main(){float a=texture(source,uv+vec2(pixel.x,0.)).y-texture(source,uv-vec2(pixel.x,0.)).y;
        float b=texture(source,uv+vec2(0.,pixel.y)).x-texture(source,uv-vec2(0.,pixel.y)).x;
        color=vec4(.5*(a-b),0.,0.,1.);}`),
      confine: program(`void main(){float l=texture(auxiliary,uv-vec2(pixel.x,0.)).r,r=texture(auxiliary,uv+vec2(pixel.x,0.)).r;
        float b=texture(auxiliary,uv-vec2(0.,pixel.y)).r,t=texture(auxiliary,uv+vec2(0.,pixel.y)).r;
        float c=texture(auxiliary,uv).r;vec2 n=vec2(abs(t)-abs(b),abs(r)-abs(l));
        n/=length(n)+.0001;n.y=-n.y;
        color=vec4(clamp(texture(source,uv).xy+n*c*dt*9.,vec2(-400.),vec2(400.)),0.,1.);}`),
      divergence: program(`void main(){vec2 c=texture(source,uv).xy;
        float l=texture(source,uv-vec2(pixel.x,0.)).x,r=texture(source,uv+vec2(pixel.x,0.)).x;
        float b=texture(source,uv-vec2(0.,pixel.y)).y,t=texture(source,uv+vec2(0.,pixel.y)).y;
        if(uv.x<pixel.x)l=-c.x;if(uv.x>1.-pixel.x)r=-c.x;
        if(uv.y<pixel.y)b=-c.y;if(uv.y>1.-pixel.y)t=-c.y;
        color=vec4(.5*(r-l+t-b),0.,0.,1.);}`),
      pressure: program(`void main(){float p=texture(source,uv-vec2(pixel.x,0.)).r+texture(source,uv+vec2(pixel.x,0.)).r+
        texture(source,uv-vec2(0.,pixel.y)).r+texture(source,uv+vec2(0.,pixel.y)).r;
        color=vec4((p-texture(auxiliary,uv).r)*.25,0.,0.,1.);}`),
      project: program(`void main(){float l=texture(auxiliary,uv-vec2(pixel.x,0.)).r,r=texture(auxiliary,uv+vec2(pixel.x,0.)).r;
        float b=texture(auxiliary,uv-vec2(0.,pixel.y)).r,t=texture(auxiliary,uv+vec2(0.,pixel.y)).r;
        color=vec4(texture(source,uv).xy-.5*vec2(r-l,t-b),0.,1.);}`),
      display: program(`void main(){float ink=max(0.,linearSample(source,uv,sourcePixel).r);
        float alpha=(1.-exp(-ink*1.65))*amount;
        color=vec4(.035,.20,.98,min(.82,alpha));}`)
    };
    const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    let resources = [], flow, dye, pressure, curl, divergence, sw, sh, dw, dh;
    let frame = 0, previous = 0, lastMove = -Infinity, lastPoint = null, pending = [];
    const bind = (texture, unit) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture); return unit; };
    function target(w, h) {
      const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      const buffer = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Fluid buffer unavailable');
      const result = { texture, buffer, w, h }; resources.push(result); return result;
    }
    function pair(w, h) { return { read: target(w,h), write: target(w,h), swap(){[this.read,this.write]=[this.write,this.read];} }; }
    function clear() {
      gl.clearColor(0,0,0,0);
      for (const t of resources) { gl.bindFramebuffer(gl.FRAMEBUFFER,t.buffer); gl.clear(gl.COLOR_BUFFER_BIT); }
      gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.clear(gl.COLOR_BUFFER_BIT);
    }
    function resize() {
      for (const r of resources) { gl.deleteTexture(r.texture); gl.deleteFramebuffer(r.buffer); }
      resources=[];
      const max=Math.max(innerWidth,innerHeight), ratio=Math.min(devicePixelRatio||1,1.5);
      canvas.width=Math.round(innerWidth*ratio);canvas.height=Math.round(innerHeight*ratio);
      sw=Math.max(32,Math.round(innerWidth/max*192));sh=Math.max(32,Math.round(innerHeight/max*192));
      dw=Math.max(64,Math.round(innerWidth/max*768));dh=Math.max(64,Math.round(innerHeight/max*768));
      flow=pair(sw,sh);dye=pair(dw,dh);pressure=pair(sw,sh);curl=target(sw,sh);divergence=target(sw,sh);
      clear();pending=[];lastPoint=null;
    }
    function draw(shader, output, values={}) {
      gl.useProgram(shader.p); gl.bindBuffer(gl.ARRAY_BUFFER,quad);
      const location=gl.getAttribLocation(shader.p,'position');gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,2,gl.FLOAT,false,0,0);
      for(const [name,value] of Object.entries(values)) {
        const u=shader.uniforms[name];if(u===undefined)continue;
        if (['source','velocity','auxiliary'].includes(name)) gl.uniform1i(u,value);
        else if(Array.isArray(value)) value.length===2?gl.uniform2f(u,...value):gl.uniform3f(u,...value);
        else gl.uniform1f(u,value);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER,output?.buffer??null);gl.viewport(0,0,output?.w??canvas.width,output?.h??canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    }
    function splat(buffer, point, impulse, radius) {
      draw(shaders.splat,buffer.write,{source:bind(buffer.read.texture,0),point,impulse,amount:radius,aspect:innerWidth/innerHeight});buffer.swap();
    }
    function animate(now) {
      frame=0;
      const fade=Math.max(0,Math.min(1,(460-(now-lastMove))/320));
      if(!fade||reduced.matches||document.hidden){clear();pending=[];lastPoint=null;previous=0;return;}
      const dt=Math.min(.022,Math.max(.008,(now-(previous||now-16))/1000));previous=now;
      const pixel=[1/sw,1/sh];
      for(const p of pending.splice(0)) {
        splat(flow,p.point,[p.dx*3200,p.dy*3200,0],.0018);
        splat(dye,p.point,[.23,0,0],.0012);
      }
      draw(shaders.curl,curl,{source:bind(flow.read.texture,0),pixel});
      draw(shaders.confine,flow.write,{source:bind(flow.read.texture,0),auxiliary:bind(curl.texture,1),pixel,dt});flow.swap();
      draw(shaders.divergence,divergence,{source:bind(flow.read.texture,0),pixel});
      for(let i=0;i<14;i++){draw(shaders.pressure,pressure.write,{source:bind(pressure.read.texture,0),auxiliary:bind(divergence.texture,1),pixel});pressure.swap();}
      draw(shaders.project,flow.write,{source:bind(flow.read.texture,0),auxiliary:bind(pressure.read.texture,1),pixel});flow.swap();
      draw(shaders.advect,flow.write,{source:bind(flow.read.texture,0),velocity:bind(flow.read.texture,1),sourcePixel:pixel,pixel,dt,decay:Math.exp(-dt*1.8)});flow.swap();
      draw(shaders.advect,dye.write,{source:bind(dye.read.texture,0),velocity:bind(flow.read.texture,1),sourcePixel:[1/dw,1/dh],pixel,dt,decay:Math.exp(-dt*1.35)});dye.swap();
      draw(shaders.display,null,{source:bind(dye.read.texture,0),sourcePixel:[1/dw,1/dh],amount:fade});
      frame=requestAnimationFrame(animate);
    }
    function move(event) {
      if(reduced.matches||!pointer.matches||event.pointerType==='touch')return;
      const now=performance.now(), next={x:event.clientX/innerWidth,y:1-event.clientY/innerHeight};
      if(!lastPoint||now-lastMove>460){lastPoint=next;lastMove=now;return;}
      const dx=next.x-lastPoint.x,dy=next.y-lastPoint.y;
      const distance=Math.hypot(dx*innerWidth,dy*innerHeight);if(distance<1)return;
      const steps=Math.min(8,Math.max(1,Math.ceil(distance/15)));
      for(let i=1;i<=steps;i++)pending.push({point:[lastPoint.x+dx*i/steps,lastPoint.y+dy*i/steps],dx:dx/steps,dy:dy/steps});
      if(pending.length>32)pending.splice(0,pending.length-32);
      lastPoint=next;lastMove=now;if(!frame)frame=requestAnimationFrame(animate);
    }
    const stop=()=>{cancelAnimationFrame(frame);frame=0;pending=[];lastPoint=null;previous=0;clear();};
    resize();canvas.dataset.renderer='fluid';
    addEventListener('pointermove',move,{passive:true});addEventListener('resize',resize,{passive:true});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
    document.documentElement.addEventListener('pointerleave',stop);
    reduced.addEventListener('change',()=>{if(reduced.matches)stop();});
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();cancelAnimationFrame(frame);canvas.style.display='none';});
  }

  // Soft curved ribbons keep the interaction available without WebGL.
  function ribbonFallback() {
    const layer=document.createElement('canvas');layer.className='cursor-light';layer.setAttribute('aria-hidden','true');layer.dataset.renderer='ribbon';document.body.append(layer);
    const ctx=layer.getContext('2d');let points=[],raf=0,lastMove=0;
    function resize(){layer.width=innerWidth;layer.height=innerHeight;points=[];}
    function paint(now){raf=0;ctx.clearRect(0,0,layer.width,layer.height);
      const fade=Math.max(0,Math.min(1,(460-(now-lastMove))/320));
      if(!fade||reduced.matches||document.hidden){points=[];return;}
      points=points.filter(p=>now-p.time<1300);
      for(let pass=0;pass<3;pass++){
        ctx.lineCap='round';ctx.lineJoin='round';ctx.filter=`blur(${[21,9,3][pass]}px)`;
        for(let i=1;i<points.length;i++){
          const p=points[i],q=points[i-1],age=(now-p.time)/1300;
          const wave=Math.sin(age*9+p.phase)*age*25;
          ctx.strokeStyle=`rgba(25,83,250,${fade*(1-age)*[.13,.1,.12][pass]})`;
          ctx.lineWidth=[58,28,7][pass]*(1-age*.5);ctx.beginPath();ctx.moveTo(q.x,q.y);
          ctx.quadraticCurveTo((p.x+q.x)/2+wave,(p.y+q.y)/2-wave,p.x,p.y);ctx.stroke();
        }
      }
      ctx.filter='none';raf=requestAnimationFrame(paint);
    }
    addEventListener('pointermove',e=>{if(reduced.matches||e.pointerType==='touch')return;const now=performance.now();if(now-lastMove>460)points=[];lastMove=now;points.push({x:e.clientX,y:e.clientY,time:now,phase:now/400});if(points.length>100)points.shift();if(!raf)raf=requestAnimationFrame(paint);},{passive:true});
    addEventListener('resize',resize,{passive:true});resize();
  }
})();
