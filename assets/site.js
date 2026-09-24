const params = new URLSearchParams(location.search);
const zh = document.documentElement.lang.startsWith('zh');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const tr = (cn,en) => zh ? cn : en;
if(params.get('preview') === '1') {
 document.body.classList.add('preview-mode');
 document.querySelectorAll('a[href]').forEach(a=>{const url=new URL(a.href,location.href);if(url.origin===location.origin){url.searchParams.set('preview','1');a.href=url.href;}});
}
function syncLanguage(){document.querySelectorAll('.language-switch').forEach(a=>{
 const url=new URL(a.href);url.hash=location.hash;
 const category=new URL(location.href).searchParams.get('category');
 if(category)url.searchParams.set('category',category);else url.searchParams.delete('category');
 a.href=url.href;
});}
syncLanguage();addEventListener('hashchange',syncLanguage);
if(!reducedMotion.matches && 'IntersectionObserver' in window) {
 const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
  if(entry.isIntersecting){entry.target.classList.add('is-revealed');observer.unobserve(entry.target);}
 }),{threshold:.05});
 document.querySelectorAll('.section,.case-section,.timeline-item').forEach(section=>{
  if(section.getBoundingClientRect().top>innerHeight){section.classList.add('reveal');observer.observe(section);}
 });
}
const cards=[...document.querySelectorAll('.poster-card')];
const filterGroup=document.querySelector('.poster-filters');
let filterAnimation;
function applyCategory(category,updateUrl=true,animate=true){
 const buttons=[...filterGroup.querySelectorAll('button')];
 if(!buttons.some(b=>b.dataset.category===category))category='all';
 buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.category===category)));
 cards.forEach(card=>{card.hidden=category!=='all'&&card.dataset.category!==category;});
 const count=cards.filter(c=>!c.hidden).length;
 document.querySelector('.poster-status').textContent=tr(`显示 ${count} 件作品`,`${count} works shown`);
 filterAnimation?.cancel();
 if(animate&&!reducedMotion.matches){filterAnimation=document.querySelector('.poster-grid').animate([{opacity:.25,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],{duration:260,easing:'ease-out'});}
 if(updateUrl){const url=new URL(location.href);if(category==='all')url.searchParams.delete('category');else url.searchParams.set('category',category);history.replaceState(null,'',url);}
 syncLanguage();
}
if(filterGroup){
 filterGroup.hidden=false;
 filterGroup.addEventListener('click',event=>{const button=event.target.closest('button');if(button)applyCategory(button.dataset.category);});
 applyCategory(params.get('category')||'all',false,false);
 addEventListener('popstate',()=>applyCategory(new URL(location.href).searchParams.get('category')||'all',false,false));
}
const dialog=document.querySelector('#lightbox');
if(dialog){
 const image=dialog.querySelector('.viewer-stage img');
 const motion=dialog.querySelector('.viewer-motion');
 const details=dialog.querySelector('.viewer-detail');
 const stage=dialog.querySelector('.viewer-stage');
 const prev=dialog.querySelector('.viewer-prev');
 const next=dialog.querySelector('.viewer-next');
 let group=[],index=0,opener,playing=false;
 function setMotion(play){
  const button=group[index];playing=play&&!!button.dataset.animation;
  image.src=playing?button.dataset.animation:(button.dataset.full||button.querySelector('img').src);
  motion.textContent=playing?tr('暂停动图','Pause animation'):tr('播放动图','Play animation');
  motion.setAttribute('aria-pressed',String(playing));
 }
 function show(i){
  index=(i+group.length)%group.length;const button=group[index];const original=button.querySelector('img');
  image.alt=original.alt;dialog.querySelector('#viewer-title').textContent=button.dataset.title||original.alt;
  dialog.querySelector('.viewer-caption').textContent=button.dataset.caption||button.closest('figure')?.querySelector('figcaption')?.textContent||'';
  dialog.querySelector('.viewer-count').textContent=`${index+1} / ${group.length}`;
  prev.disabled=next.disabled=group.length<2;motion.hidden=!button.dataset.animation;
  stage.classList.remove('is-detail');details.setAttribute('aria-pressed','false');details.textContent=tr('查看细节','View details');
  stage.scrollTop=0;setMotion(false);
  if(!reducedMotion.matches)image.animate([{opacity:.25},{opacity:1}],{duration:180});
 }
 document.querySelectorAll('.zoom').forEach(button=>button.addEventListener('click',()=>{
  opener=button;
  group=button.closest('.poster-grid')?cards.filter(c=>!c.hidden).map(c=>c.querySelector('.zoom')):[...button.closest('.gallery').querySelectorAll('.zoom')];
  show(group.indexOf(button));dialog.showModal();document.body.classList.add('viewer-open');
 }));
 dialog.querySelector('.viewer-close').addEventListener('click',()=>dialog.close());
 prev.addEventListener('click',()=>show(index-1));next.addEventListener('click',()=>show(index+1));
 details.addEventListener('click',()=>{const expanded=stage.classList.toggle('is-detail');details.setAttribute('aria-pressed',String(expanded));details.textContent=expanded?tr('适应屏幕','Fit to screen'):tr('查看细节','View details');});
 motion.addEventListener('click',()=>setMotion(!playing));
 dialog.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'){event.preventDefault();show(index-1);}if(event.key==='ArrowRight'){event.preventDefault();show(index+1);}});
 dialog.addEventListener('close',()=>{image.removeAttribute('src');document.body.classList.remove('viewer-open');opener?.focus({preventScroll:true});});
 dialog.addEventListener('click',event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();}});
 image.addEventListener('error',()=>{dialog.querySelector('.viewer-caption').textContent=tr('图片暂时无法加载，请关闭后重试。','This image could not load. Please close and try again.');});
 reducedMotion.addEventListener('change',event=>{if(event.matches&&dialog.open&&playing)setMotion(false);});
}
