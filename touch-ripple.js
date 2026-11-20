/* タップ/クリック位置に青い波紋を出すだけの演出。リンクや保存データには一切触れない。 */
(function () {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  addEventListener('pointerdown', function (e) {
    const r = document.createElement('span');
    r.className = 'touch-ripple';
    r.setAttribute('aria-hidden', 'true');
    const size = 190;
    r.style.left = e.clientX + 'px';
    r.style.top = e.clientY + 'px';
    r.style.width = size + 'px';
    r.style.height = size + 'px';
    document.body.appendChild(r);
    r.addEventListener('animationend', function () { r.remove(); });
  }, { passive: true });
})();
