/* Search-only visual game: never changes links, saved data, or page content. */
(function () {
  const SIZE = 56;
  let active = false, board, band, overlay, ctx, boardCtx, frame = 0;
  let holes = new Set(), blocks = new Set(), particles = [], count = 0;
  let hand = { x: 0, y: 0, until: 0 }, focusBefore;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function color(name) { return getComputedStyle(document.documentElement).getPropertyValue('--mine-' + name).trim(); }
  function tile(c, x, y, size, underground, ore) {
    const base = color(underground ? 'earth' : 'stone');
    c.fillStyle = base; c.fillRect(x, y, size, size);
    for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < 8; xx++) {
      const n = (((xx + Math.floor(x)) * 374761393 ^ (yy + Math.floor(y)) * 668265263) >>> 3) % 11;
      c.fillStyle = color(underground ? (n < 5 ? 'earth' : 'earth-light') : (n < 4 ? 'stone-dark' : n < 8 ? 'stone' : 'stone-light'));
      c.fillRect(x + xx * size / 8, y + yy * size / 8, size / 8 + 1, size / 8 + 1);
    }
    if (ore && !underground) {
      c.fillStyle = color(ore);
      [[2,2],[5,1],[3,5],[6,4],[1,6]].forEach(([xx,yy]) => c.fillRect(x+xx*size/8,y+yy*size/8,size/8,size/8));
    }
  }
  function resize() {
    if (!active) return;
    overlay.width = innerWidth; overlay.height = innerHeight;
    board.width = Math.round(board.getBoundingClientRect().width); board.height = Math.round(board.getBoundingClientRect().height);
    drawBoard(); draw();
  }
  function drawBoard() {
    for (let y = 0; y < board.height; y += SIZE) for (let x = 0; x < board.width; x += SIZE) {
      const key = `${x / SIZE}:${y / SIZE}`;
      const seed = (x / SIZE * 3 + y / SIZE * 7) % 13;
      tile(boardCtx, x, y, SIZE, blocks.has(key), seed === 1 ? 'ore' : seed === 5 ? 'gold' : seed === 9 ? 'red' : null);
    }
  }
  function draw(time = performance.now()) {
    if (!active) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    holes.forEach(key => { const [x,y] = key.split(':').map(Number); tile(ctx, x * SIZE - scrollX, y * SIZE - scrollY, SIZE, true); });
    particles = particles.filter(p => time - p.born < 450);
    particles.forEach(p => {
      const age = (time-p.born)/450;
      ctx.globalAlpha = 1-age; ctx.fillStyle = p.color;
      ctx.fillRect(p.x-scrollX+p.vx*age,p.y-scrollY+p.vy*age+70*age*age,8,8);
    }); ctx.globalAlpha = 1;
    if (time < hand.until && !reduce) {
      ctx.save(); ctx.translate(Math.min(innerWidth-35,hand.x+80),Math.min(innerHeight+10,hand.y+220));
      ctx.rotate(-.55 + Math.sin((hand.until-time)/80)*.18);
      ctx.fillStyle=color('skin-dark');ctx.fillRect(-55,-210,110,300);
      ctx.fillStyle=color('skin');ctx.fillRect(-45,-205,90,300);
      ctx.fillStyle=color('skin-light');ctx.fillRect(-45,-205,32,120);
      ctx.fillStyle=color('skin-dark');[[5,-190],[-25,-115],[20,-60]].forEach(([x,y])=>ctx.fillRect(x,y,24,38));
      ctx.restore();
    }
    if (particles.length || time < hand.until) frame=requestAnimationFrame(draw); else frame=0;
  }
  function mine(e) {
    if (!active || e.button > 0 || e.target.closest('button,input,textarea,select,.header,.header-search,.gnav,.mnav,[role="dialog"]')) return;
    const page = document.querySelector('.page.active');
    if (!page || !page.contains(e.target)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    let changed=false;
    if (e.target === board) {
      const r=board.getBoundingClientRect(), key=`${Math.floor((e.clientX-r.left)/SIZE)}:${Math.floor((e.clientY-r.top)/SIZE)}`;
      if (!blocks.has(key)) { blocks.add(key); changed=true; drawBoard(); }
    } else {
      const key=`${Math.floor((e.clientX+scrollX)/SIZE)}:${Math.floor((e.clientY+scrollY)/SIZE)}`;
      if (!holes.has(key)) { holes.add(key); changed=true; }
    }
    if (!changed) return;
    count++; band.querySelector('.mine-count').textContent=`${count} ブロック`;
    hand={x:e.clientX,y:e.clientY,until:performance.now()+350};
    if (!reduce) for(let i=0;i<14;i++) particles.push({x:e.clientX+scrollX,y:e.clientY+scrollY,vx:(Math.random()-.5)*180,vy:-Math.random()*120,born:performance.now(),color:color(i%2?'stone-light':'stone-dark')});
    cancelAnimationFrame(frame); draw();
  }
  function reset() { holes.clear(); blocks.clear(); particles=[]; count=0; hand.until=0; band.querySelector('.mine-count').textContent='0 ブロック';drawBoard();draw(); }
  function stop() {
    if (!active) return;
    active=false;cancelAnimationFrame(frame);band.remove();overlay.remove();document.body.classList.remove('mine-active');
    document.removeEventListener('click',mine,true);document.removeEventListener('keydown',key);removeEventListener('resize',resize);removeEventListener('scroll',drawOnScroll);
    holes.clear();blocks.clear();particles=[];focusBefore?.focus({preventScroll:true});
  }
  function key(e) { if(e.key==='Escape') stop(); }
  function drawOnScroll() { cancelAnimationFrame(frame);draw(); }
  function start() {
    if (active) return;
    const host=document.querySelector('.page.active');if(!host)return;
    active=true;focusBefore=document.activeElement;count=0;
    band=document.createElement('section');band.className='mine-band';band.setAttribute('aria-label','Minecraft');
    band.innerHTML='<div class="mine-toolbar"><h2>Minecraft</h2><span class="mine-count" role="status">0 ブロック</span><button type="button" class="icon-btn" title="元に戻す" aria-label="元に戻す"><svg viewBox="0 0 24 24"><path d="M3 10a9 9 0 1 1 2 9M3 3v7h7"/></svg></button><button type="button" class="icon-btn" title="終了" aria-label="Minecraftを終了"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div><canvas class="mine-board" role="button" tabindex="0" aria-label="鉱石ブロック" ></canvas>';
    host.prepend(band);board=band.querySelector('canvas');boardCtx=board.getContext('2d');
    overlay=document.createElement('canvas');overlay.id='mine-effects';overlay.setAttribute('aria-hidden','true');document.body.appendChild(overlay);ctx=overlay.getContext('2d');
    const buttons=band.querySelectorAll('button');buttons[0].onclick=reset;buttons[1].onclick=stop;
    board.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();const r=board.getBoundingClientRect();const available=Array.from({length:Math.ceil(board.width/SIZE)*Math.ceil(board.height/SIZE)},(_,i)=>[i%Math.ceil(board.width/SIZE),Math.floor(i/Math.ceil(board.width/SIZE))]).find(([x,y])=>!blocks.has(`${x}:${y}`));if(available)mine({target:board,button:0,clientX:r.left+available[0]*SIZE+8,clientY:r.top+available[1]*SIZE+8,preventDefault(){},stopImmediatePropagation(){}});}});
    document.body.classList.add('mine-active');document.addEventListener('click',mine,true);document.addEventListener('keydown',key);addEventListener('resize',resize);addEventListener('scroll',drawOnScroll,{passive:true});resize();
  }
  window.MinecraftSearch={start,stop};
  document.getElementById('searchInput')?.addEventListener('input',e=>{if(!/^(minecraft|マインクラフト|マイクラ)$/i.test(e.target.value.trim()))stop();});
  const original=window.showPage;
  window.showPage=function(){stop();return original.apply(this,arguments);};
})();
