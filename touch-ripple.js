/* タップ/クリック位置に波紋を出す。さらに指でスクロール（なぞる）中も、指の軌跡に沿って小さな波紋を出す。
   見た目のみ・リンクや保存データには一切触れない。 */
(function () {
  function spawn(x, y, trail) {
    var b = document.body; if (!b) return;
    var r = document.createElement('span');
    r.className = 'touch-ripple' + (trail ? ' is-trail' : '');
    r.setAttribute('aria-hidden', 'true');
    r.style.left = x + 'px'; r.style.top = y + 'px';
    var size = trail ? 120 : 180;
    r.style.width = size + 'px'; r.style.height = size + 'px';
    b.appendChild(r);
    var done = function () { if (r.parentNode) r.parentNode.removeChild(r); };
    r.addEventListener('animationend', done);
    setTimeout(done, trail ? 1000 : 1200);
  }

  // タップ・クリック時の波紋（従来どおり）
  addEventListener('pointerdown', function (e) { spawn(e.clientX, e.clientY, false); }, { passive: true, capture: true });

  // スクロール（指でなぞる）中の軌跡波紋：タッチ操作のみ対象
  var last = null, lastT = 0, touching = false;
  function trailAt(x, y) {
    var now = Date.now();
    if (last && now - lastT < 70 && Math.hypot(x - last.x, y - last.y) < 36) return; // 間引き
    last = { x: x, y: y }; lastT = now;
    spawn(x, y, true);
  }
  function touchStart(e) { touching = true; last = null; }
  function touchMove(e) {
    if (!touching) return;
    var t = e.touches && e.touches[0];
    if (t) trailAt(t.clientX, t.clientY);
  }
  function touchEnd() { touching = false; last = null; }
  addEventListener('touchstart', touchStart, { passive: true, capture: true });
  addEventListener('touchmove', touchMove, { passive: true, capture: true });
  addEventListener('touchend', touchEnd, { passive: true, capture: true });
  addEventListener('touchcancel', touchEnd, { passive: true, capture: true });
})();
