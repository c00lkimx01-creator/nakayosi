/* NKYS music: device files remain on this device and are held for this session. */
(function bootMusic() {
  'use strict';
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', bootMusic, { once:true }); return; }
  const tracks = new Map();
  let source = 'device';
  const app = document.getElementById('search-app');
  if (!app) return;
  const tools = document.createElement('div');
  tools.id = 'musicTools';
  tools.hidden = true;
  tools.innerHTML = '<div class="music-toolbar"><div class="music-sources" role="group" aria-label="音楽の検索先"><button type="button" data-source="device" aria-pressed="true">マイ音楽</button><button type="button" data-source="online" aria-pressed="false">曲を探す</button></div><button type="button" id="addMusicButton" class="music-add">＋ 音楽を追加</button><input type="file" id="musicFiles" accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.aac,.opus" multiple hidden></div><p class="music-note">追加した音楽はこの画面を閉じるまで利用できます。オンラインの曲は試聴のみです。</p><p id="musicStatus" class="music-note" role="status" aria-live="polite"></p>';
  document.getElementById('tabs').after(tools);
  const status = document.getElementById('musicStatus');
  const input = document.getElementById('musicFiles');
  const button = document.getElementById('addMusicButton');
  button.addEventListener('click', () => input.click());
  const refresh = () => {
    document.getElementById('mainContainer').classList.add('results-mode');
    window.refreshMusicSearch?.();
  };
  tools.querySelectorAll('[data-source]').forEach(b => b.addEventListener('click', () => {
    source = b.dataset.source;
    tools.querySelectorAll('[data-source]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    status.textContent = '';
    refresh();
  }));
  input.addEventListener('change', () => {
    let added = 0, invalid = 0;
    for (const file of input.files || []) {
      if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|wav|ogg|flac|aac|opus)$/i.test(file.name)) { invalid++; continue; }
      const key = file.name + ':' + file.size + ':' + file.lastModified;
      if (Array.from(tracks.values()).some(t => t.key === key)) continue;
      const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + tracks.size;
      const url = URL.createObjectURL(file);
      tracks.set(id, { id, key, title: file.name.replace(/\.[^.]+$/, ''), artist: 'この端末', album: '追加した音楽', previewUrl: url, url, local: true, file });
      added++;
    }
    source = 'device';
    tools.querySelectorAll('[data-source]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.source === source)));
    status.textContent = added + '曲を追加しました。' + (invalid ? '音楽以外のファイルは追加されませんでした。' : '');
    input.value = '';
    refresh();
  });
  app.addEventListener('play', e => {
    if (e.target.tagName !== 'AUDIO') return;
    app.querySelectorAll('audio').forEach(a => { if (a !== e.target) a.pause(); });
  }, true);
  function render(items, results) {
    results.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('p'); empty.className = 'music-empty';
      empty.textContent = source === 'device' ? (tracks.size ? '一致する曲がありません。' : 'まだ音楽がありません。') : '検索する曲名・アーティスト名を入力してください。';
      results.appendChild(empty); return;
    }
    const grid = document.createElement('div'); grid.className = 'music-grid';
    for (const item of items) {
      const card = document.createElement('article'); card.className = 'card music-track';
      if (item.img_src) {
        const img = document.createElement('img'); img.src = item.img_src; img.alt = item.album || item.title; img.loading = 'lazy'; card.appendChild(img);
      } else {
        const cover = document.createElement('div'); cover.className = 'music-cover'; cover.textContent = '♫'; cover.setAttribute('aria-hidden', 'true'); card.appendChild(cover);
      }
      const body = document.createElement('div'); body.className = 'card-body';
      const title = document.createElement('h3'); title.className = 'card-title'; title.textContent = item.title || 'タイトルなし';
      const meta = document.createElement('p'); meta.className = 'card-meta'; meta.textContent = [item.artist, item.album].filter(Boolean).join(' · ');
      const badge = document.createElement('span'); badge.className = 'music-note'; badge.textContent = item.local ? 'フル再生' : '試聴';
      body.append(title, meta, badge);
      if (item.previewUrl) {
        const audio = document.createElement('audio'); audio.controls = true; audio.preload = 'none'; audio.src = item.previewUrl; audio.setAttribute('aria-label', item.title + 'を再生');
        audio.addEventListener('error', () => { badge.textContent = item.local ? 'この形式を再生できません。MP3やWAVをお試しください。' : '試聴を再生できません。Apple Musicで曲を開いてください。'; });
        body.appendChild(audio);
      } else { badge.textContent = '試聴音源なし'; }
      if (item.local) {
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'music-remove'; remove.textContent = '削除'; remove.setAttribute('aria-label', item.title + 'を削除');
        remove.onclick = () => { card.querySelector('audio')?.pause(); URL.revokeObjectURL(item.previewUrl); tracks.delete(item.id); refresh(); status.textContent = '曲を削除しました。'; };
        body.appendChild(remove);
      } else if (item.url && /^https:\/\//.test(item.url)) {
        const link = document.createElement('a'); link.href = item.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Apple Musicで開く'; link.className = 'music-store'; body.appendChild(link);
      }
      card.appendChild(body); grid.appendChild(card);
    }
    results.appendChild(grid);
  }
  window.nkysMusic = {
    show(active) { tools.hidden = !active; },
    get source() { return source; },
    search(query) { const q = query.normalize('NFKC').toLocaleLowerCase(); return Array.from(tracks.values()).filter(t => [t.title, t.artist, t.album].join(' ').normalize('NFKC').toLocaleLowerCase().includes(q)); },
    render,
    message(text) { status.textContent = text; }
  };
  const actions = app.querySelector('.nkys-quick-actions');
  if (actions) {
    const music = document.createElement('button'); music.type = 'button'; music.className = 'nkys-quick-action'; music.title = '音楽'; music.setAttribute('aria-label', '音楽');
    music.innerHTML = '<svg viewBox="0 0 24 24"><use href="#icon-music"></use></svg><span>音楽</span>';
    music.onclick = () => {
      const tab = app.querySelector('.tab[data-cat="music"]');
      window.changeCategory('music', { currentTarget: tab });
    };
    actions.insertBefore(music, actions.lastElementChild);
  }
  window.addEventListener('pagehide', () => tracks.forEach(t => URL.revokeObjectURL(t.previewUrl)));
})();
