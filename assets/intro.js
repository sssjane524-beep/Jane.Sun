(()=>{
 const scene=document.querySelector('.intro-scene');if(!scene)return;
 const typed=scene.querySelector('.typed-copy');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const full=typed.dataset.text,letters=Array.from(full);
 let index=0,timer,frame;
 function tick(){typed.textContent=letters.slice(0,++index).join('');if(index<letters.length)timer=setTimeout(tick,document.documentElement.lang.startsWith('zh')?95:38);}
 function start(){clearTimeout(timer);if(reduced.matches){typed.textContent=full;index=letters.length;return;}typed.textContent='';index=0;timer=setTimeout(tick,450);}
 start();reduced.addEventListener('change',start);
 const orb=scene.querySelector('.orb-drift');
 const orbit=scene.querySelector('.orbit-navigation');
 if(orbit){
  const caption=scene.querySelector('.orbit-selection');
  const show=link=>{caption.textContent=link.dataset.orbitLabel;caption.classList.add('is-active');};
  const hide=()=>{caption.classList.remove('is-active');};
  orbit.querySelectorAll('[data-orbit-label]').forEach(link=>{
   link.addEventListener('pointerenter',()=>show(link));
   link.addEventListener('pointerleave',()=>{if(document.activeElement!==link)hide();});
   link.addEventListener('focus',()=>show(link));
   link.addEventListener('blur',hide);
  });
 }
 function scroll(){if(frame)return;frame=requestAnimationFrame(()=>{orb.style.setProperty('--orb-scroll',reduced.matches?'0px':Math.min(45,Math.max(-20,-scene.getBoundingClientRect().top*.09))+'px');frame=null;});}
 addEventListener('scroll',scroll,{passive:true});
 reduced.addEventListener('change',scroll);
 document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(timer);}else if(index<letters.length&&!reduced.matches){tick();}});
})();
