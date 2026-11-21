/* タップ/クリック位置に青い波紋を出すだけの演出。リンクや保存データには一切触れない。 */
(function () {
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
})();
