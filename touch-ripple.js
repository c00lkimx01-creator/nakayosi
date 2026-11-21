/* タップ/クリック位置に波紋を出す。指でなぞって（スクロール）いる間は、指の軌跡に沿って
   青く光る線が伸びて消える「光の尾」を背景に描く。見た目のみ・リンクや保存データには一切触れない。 */
(function () {
  // ---------- タップ時の波紋（従来どおり） ----------
  function spawn(x, y) {
    var b = document.body; if (!b) return;
    var r = document.createElement('span');
    r.className = 'touch-ripple';
    r.setAttribute('aria-hidden', 'true');
    r.style.left = x + 'px'; r.style.top = y + 'px';
    r.style.width = '180px'; r.style.height = '180px';
    b.appendChild(r);
    var done = function () { if (r.parentNode) r.parentNode.removeChild(r); };
    r.addEventListener('animationend', done);
    setTimeout(done, 1200);
  }
  addEventListener('pointerdown', function (e) { spawn(e.clientX, e.clientY); }, { passive: true, capture: true });

  // ---------- スクロール中の光の尾（指の軌跡を線で描く） ----------
  var LIFE = 900;          // 尾が消えるまでの時間(ms)
  var WIDTH = 16;           // 先端の線の太さ(px)
  var points = [];         // {x,y,t}
  var touching = false;
  var canvas = null, ctx = null, dpr = 1, raf = 0;

  function ensureCanvas() {
    if (canvas || !document.body) return;
    canvas = document.createElement('canvas');
    canvas.className = 'touch-trail-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    addEventListener('resize', resize);
  }
  function resize() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
  }
  function color(alpha) {
    var c = getComputedStyle(document.body).getPropertyValue('--ripple-blue').trim() || '#1a73e8';
    // #rrggbb → rgba
    var m = /^#([0-9a-f]{6})$/i.exec(c);
    if (m) {
      var n = parseInt(m[1], 16);
      return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + alpha + ')';
    }
    return c;
  }
  function draw() {
    raf = 0;
    if (!ctx) return;
    var now = Date.now();
    while (points.length && now - points[0].t > LIFE) points.shift();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (points.length > 1) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = color(0.7);
      ctx.shadowBlur = 18;
      for (var i = 1; i < points.length; i++) {
        var a = points[i - 1], b = points[i];
        var age = (now - b.t) / LIFE;         // 0=新しい 1=消滅
        var fade = Math.max(0, 1 - age);
        ctx.strokeStyle = color((0.9 * fade).toFixed(3));
        ctx.lineWidth = Math.max(0.6, WIDTH * Math.pow(fade, 1.5)); // 尾ほど細く
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    if (points.length || touching) raf = requestAnimationFrame(draw);
  }
  function addPoint(x, y) {
    ensureCanvas();
    var now = Date.now();
    var p = points[points.length - 1];
    if (p && Math.hypot(x - p.x, y - p.y) < 2) return;
    points.push({ x: x, y: y, t: now });
    if (!raf) raf = requestAnimationFrame(draw);
  }

  addEventListener('touchstart', function (e) {
    touching = true;
    var t = e.touches && e.touches[0];
    if (t) addPoint(t.clientX, t.clientY);
  }, { passive: true, capture: true });
  addEventListener('touchmove', function (e) {
    if (!touching) return;
    var t = e.touches && e.touches[0];
    if (t) addPoint(t.clientX, t.clientY);
  }, { passive: true, capture: true });
  function endTouch() { touching = false; }
  addEventListener('touchend', endTouch, { passive: true, capture: true });
  addEventListener('touchcancel', endTouch, { passive: true, capture: true });
})();
