// ── 遅延ライブラリローダー（Leaflet / hls.js は必要なページを開いた時だけ読み込む） ──
function __loadJsOnce(src){
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = src; s.onload = () => resolve(true); s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}
let __leafletPromise = null, __hlsPromise = null;
function isMapPageActive(){
  const q = document.getElementById('quake-page');
  const w = document.getElementById('weather-page');
  return !!((q && q.classList.contains('active')) || (w && w.classList.contains('active')));
}
function ensureLeaflet(){
  if (typeof L !== 'undefined') return Promise.resolve(true);
  if (!__leafletPromise){
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    __leafletPromise = __loadJsOnce('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
  }
  return __leafletPromise;
}
function ensureHls(){
  if (window.Hls) return Promise.resolve(true);
  if (!__hlsPromise) __hlsPromise = __loadJsOnce('https://cdn.jsdelivr.net/npm/hls.js@1');
  return __hlsPromise;
}


(function(){

        let SERPAPI_KEYS_WEB = [];
        let SERPAPI_KEYS_IMAGE = [];

        const searchCache = new Map();

        let currentWebKeyIdx = 0;
        let currentImageKeyIdx = 0;
        let currentQuery = '';
        let currentPage = 1;
        let currentCategory = 'general';
        let isLoading = false;
        let hasMoreResults = true;
        let seenItemsSet = new Set();
        let inputDebounceTimer = null;

        let currentImagesData = [];
        let activeImageIndex = 0;

        (function init() {
            loadSettings();
            window.addEventListener('scroll', handleAutoScroll, { passive: true });
        })();

        function parseKeysFromInput(text) {
            if (!text) return [];
            return text.split(/[\n,]/).map(k => k.trim()).filter(k => k.length > 0);
        }

        function loadSettings() {
            const savedTheme = localStorage.getItem('nkys_search_theme') || 'light';
            document.getElementById('search-app').setAttribute('data-theme', savedTheme);
            document.getElementById('settingTheme').value = savedTheme;

            if (localStorage.getItem('settingDeduplicate') !== null) {
                document.getElementById('settingDeduplicate').value = localStorage.getItem('settingDeduplicate');
            }
            if (localStorage.getItem('settingOmadaApi')) {
                document.getElementById('settingOmadaApi').value = localStorage.getItem('settingOmadaApi');
            }
            if (localStorage.getItem('settingRakutenAppId')) {
                document.getElementById('settingRakutenAppId').value = localStorage.getItem('settingRakutenAppId');
            }

            const rawWebKeys = localStorage.getItem('settingSerpKeysWeb') || '';
            const rawImgKeys = localStorage.getItem('settingSerpKeysImage') || '';
            document.getElementById('settingSerpKeysWeb').value = rawWebKeys;
            document.getElementById('settingSerpKeysImage').value = rawImgKeys;

            SERPAPI_KEYS_WEB = parseKeysFromInput(rawWebKeys);
            SERPAPI_KEYS_IMAGE = parseKeysFromInput(rawImgKeys);
        }

        function sxSaveSettings() {
            const theme = document.getElementById('settingTheme').value;
            localStorage.setItem('nkys_search_theme', theme);
            document.getElementById('search-app').setAttribute('data-theme', theme);

            localStorage.setItem('settingDeduplicate', document.getElementById('settingDeduplicate').value);
            localStorage.setItem('settingOmadaApi', document.getElementById('settingOmadaApi').value);
            localStorage.setItem('settingRakutenAppId', document.getElementById('settingRakutenAppId').value);

            const webKeysVal = document.getElementById('settingSerpKeysWeb').value;
            const imgKeysVal = document.getElementById('settingSerpKeysImage').value;
            localStorage.setItem('settingSerpKeysWeb', webKeysVal);
            localStorage.setItem('settingSerpKeysImage', imgKeysVal);

            SERPAPI_KEYS_WEB = parseKeysFromInput(webKeysVal);
            SERPAPI_KEYS_IMAGE = parseKeysFromInput(imgKeysVal);

            closeSettings();
        }

        function onInputSearch() {
            const input = document.getElementById('sxSearchInput').value;
            document.getElementById('clearBtn').style.display = input ? 'flex' : 'none';

            clearTimeout(inputDebounceTimer);
            if (!input.trim()) {
                document.getElementById('autocompleteDropdown').style.display = 'none';
                return;
            }

            inputDebounceTimer = setTimeout(async () => {
                try{ window.__sugCtrl && window.__sugCtrl.abort(); }catch(_){}
                const ctrl = (window.__sugCtrl = new AbortController());
                const sigAbort = ctrl.signal;
                const escapeHtml = (t) => t.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
                let suggestions = [];
                const jobs = [];
                jobs.push((async () => {
                    try {
                        const wRes = await fetch(`https://ja.wikipedia.org/w/api.php?action=opensearch&format=json&origin=*&limit=8&search=${encodeURIComponent(input)}`, { signal: sigAbort });
                        if (wRes.ok) {
                            const wData = await wRes.json();
                            if (Array.isArray(wData?.[1])) return wData[1];
                        }
                    } catch(e) {}
                    return [];
                })());
                jobs.push((async () => {
                    try {
                        const dRes = await fetch(`https://api.duckduckgo.com/ac/?q=${encodeURIComponent(input)}&type=list`, { signal: sigAbort });
                        if (dRes.ok) {
                            const dData = await dRes.json();
                            if (Array.isArray(dData?.[1])) return dData[1];
                        }
                    } catch(e) {}
                    return [];
                })());
                const lists = await Promise.all(jobs);
                if(sigAbort.aborted) return;
                suggestions = [...new Set(lists.flat())];
                if (suggestions.length > 0) {
                    const dropdown = document.getElementById('autocompleteDropdown');
                    dropdown.innerHTML = suggestions.slice(0, 8).map(t =>
                        `<div class="autocomplete-item" onclick="selectSuggest(decodeURIComponent('${encodeURIComponent(t)}'))">` +
                        `<svg class="autocomplete-ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.8-3.8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>` +
                        `<span>${escapeHtml(t)}</span></div>`
                    ).join('');
                    dropdown.style.display = 'block';
                    return;
                }
                document.getElementById('autocompleteDropdown').style.display = 'none';
            }, 260);
        }

        function selectSuggest(text) {
            document.getElementById('sxSearchInput').value = text;
            document.getElementById('autocompleteDropdown').style.display = 'none';
            handleSearch();
        }

        function clearSearch() {
            document.getElementById('sxSearchInput').value = '';
            document.getElementById('clearBtn').style.display = 'none';
            document.getElementById('autocompleteDropdown').style.display = 'none';
        }

        function openAbout() { document.getElementById('aboutModal').style.display = 'flex'; }
        function closeAbout() { document.getElementById('aboutModal').style.display = 'none'; }
        function openSettings() { document.getElementById('settingsModal').style.display = 'flex'; }
        function closeSettings() { document.getElementById('settingsModal').style.display = 'none'; }

        function deduplicateResults(items) {
            const isDeduplicateEnabled = document.getElementById('settingDeduplicate').value === 'true';
            if (!isDeduplicateEnabled || !Array.isArray(items)) return items;

            return items.filter(item => {
                const key = item.url || item.img_src || item.videoId || item.previewUrl;
                if (!key) return true;
                if (seenItemsSet.has(key)) return false;
                seenItemsSet.add(key);
                return true;
            });
        }

        function showGhostScreen(type, isNextPage = false) {
            if (isNextPage) return;
            const resultsDiv = document.getElementById('results');
            const sidebar = document.getElementById('sidebar');

            let ghostHtml = '';
            if (type === 'images') {
                ghostHtml = `<div class="image-grid">` + '<div class="ghost-pulse ghost-grid-card"></div>'.repeat(8) + `</div>`;
            } else if (['shopping', 'music'].includes(type)) {
                ghostHtml = `<div class="${type}-grid">` + '<div class="ghost-pulse ghost-grid-card"></div>'.repeat(8) + `</div>`;
            } else {
                ghostHtml = '<div class="ghost-pulse ghost-item"></div>'.repeat(5);
            }
            resultsDiv.innerHTML = ghostHtml;

            if (type === 'videos' || type === 'general' || type === 'news') {
                sidebar.innerHTML = '<div class="ghost-pulse ghost-sidebar-card"></div><div class="ghost-pulse ghost-sidebar-card"></div>';
                sidebar.classList.add('active');
            } else {
                sidebar.classList.remove('active');
            }
        }

        function handleSearch(e) {
            if(e) e.preventDefault();
            const q = document.getElementById('sxSearchInput').value.trim();
            if(!q) return;

            currentQuery = q;
            currentPage = 1;
            hasMoreResults = true;
            seenItemsSet.clear();
            currentImagesData = [];

            document.getElementById('autocompleteDropdown').style.display = 'none';
            document.getElementById('mainContainer').classList.add('results-mode');
            
            showGhostScreen(currentCategory);
            executeSearch();

            if (currentCategory === 'news' || currentCategory === 'general') {
                setTimeout(() => fetchWikipediaKnowledgePanel(currentQuery), 10);
            }
        }

        function changeCategory(cat, evt) {
            if(isLoading || currentCategory === cat) return;
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            evt.currentTarget.classList.add('active');

            currentCategory = cat;
            currentPage = 1;
            hasMoreResults = true;
            seenItemsSet.clear();
            currentImagesData = [];

            showGhostScreen(currentCategory);

            if(currentQuery) {
                executeSearch();
                if (currentCategory === 'news' || currentCategory === 'general') {
                    setTimeout(() => fetchWikipediaKnowledgePanel(currentQuery), 10);
                }
            }
        }

        async function executeSearch(isNextPage = false) {
            const cacheKey = `${currentCategory}:${currentQuery}:${currentPage}`;
            
            if (searchCache.has(cacheKey)) {
                const cachedData = searchCache.get(cacheKey);
                renderResults(deduplicateResults(cachedData), isNextPage, currentCategory);
                if (currentCategory === 'videos' && !isNextPage) {
                    fetchSideShorts(currentQuery);
                }
                return;
            }

            isLoading = true;
            if (isNextPage) {
                document.getElementById('infiniteLoader').style.display = 'block';
            }

            let rawResults = [];

            if (currentCategory === 'shopping') {
                rawResults = await fetchRakutenShoppingAPI(currentQuery, currentPage);
            } else if (currentCategory === 'music') {
                rawResults = await fetchITunesMusicAPI(currentQuery);
            } else if (currentCategory === 'images') {
                rawResults = await fetchImageSearch(currentQuery, currentPage);
            } else if (currentCategory === 'news') {
                rawResults = await fetchNewsMultiAPI(currentQuery, currentPage);
            } else if (currentCategory === 'videos') {
                rawResults = await fetchOmadaMedia(currentQuery, currentPage);
            } else {
                rawResults = await fetchFastSerpApiSearch(currentQuery, currentPage);
            }

            if (rawResults.length > 0) {
                searchCache.set(cacheKey, rawResults);
            }

            const results = deduplicateResults(rawResults);

            isLoading = false;
            document.getElementById('infiniteLoader').style.display = 'none';
            renderResults(results, isNextPage, currentCategory);

            if (currentCategory === 'videos' && !isNextPage) {
                fetchSideShorts(currentQuery);
            }
        }

        async function fetchTextWithProxy(targetUrl) {
            const proxyProviders = [
                `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
                `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`
            ];

            for (const pUrl of proxyProviders) {
                try {
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), 4500);
                    const res = await fetch(pUrl, { signal: controller.signal });
                    clearTimeout(timer);

                    if (res.ok) {
                        const text = await res.text();
                        if (text && !text.includes("403 Forbidden")) return text;
                    }
                } catch (e) {}
            }
            return null;
        }

        /* SearXNG (search.lumy.live) 検索API */
        async function fetchSearxngWeb(query, page = 1) {
            const targetUrl = `https://search.lumy.live/search?q=${encodeURIComponent(query)}&format=json&pageno=${page}`;

            try {
                const res = await fetch(targetUrl);
                if (res.ok) {
                    const data = await res.json();
                    if (data.results && data.results.length > 0) {
                        return data.results.map(item => ({
                            title: item.title,
                            url: item.url,
                            content: item.content || ''
                        }));
                    }
                }
            } catch (e) {}

            const rawText = await fetchTextWithProxy(targetUrl);
            if (rawText) {
                try {
                    const data = JSON.parse(rawText);
                    if (data.results && data.results.length > 0) {
                        return data.results.map(item => ({
                            title: item.title,
                            url: item.url,
                            content: item.content || ''
                        }));
                    }
                } catch (e) {}
            }

            return [];
        }

        async function fetchSearxngImages(query, page = 1) {
            const targetUrl = `https://search.lumy.live/search?q=${encodeURIComponent(query)}&categories=images&format=json&pageno=${page}`;

            try {
                const res = await fetch(targetUrl);
                if (res.ok) {
                    const data = await res.json();
                    if (data.results && data.results.length > 0) {
                        return data.results.map(item => ({
                            title: item.title || query,
                            url: item.url || item.img_src,
                            img_src: item.img_src || item.thumbnail_src,
                            source_name: item.engine || ''
                        }));
                    }
                }
            } catch (e) {}

            const rawText = await fetchTextWithProxy(targetUrl);
            if (rawText) {
                try {
                    const data = JSON.parse(rawText);
                    if (data.results && data.results.length > 0) {
                        return data.results.map(item => ({
                            title: item.title || query,
                            url: item.url || item.img_src,
                            img_src: item.img_src || item.thumbnail_src,
                            source_name: item.engine || ''
                        }));
                    }
                } catch (e) {}
            }

            return [];
        }

        async function fetchFastSerpApiSearch(query, page = 1) {
  const results = [];
  try {
    const r = await fetch(`https://visual-query-pal.lovable.app/api/search?q=${encodeURIComponent(query)}`, {cache:'no-store'});
    if (r.ok) {
      const d = await r.json();
      if (Array.isArray(d?.results)) {
        d.results.forEach(x => { if (x?.url) results.push({ title: x.title || query, url: x.url, content: x.snippet || '' }); });
      }
    }
  } catch(_) {}
  const wiki = await fetchWikipediaSearch(query);
  const seen = new Set(results.map(x => x.url));
  wiki.forEach(x => { if (!seen.has(x.url)) results.push(x); });
  return results;
}
async function fetchImageSearch(query, page = 1) {
  const results = [];
  try {
    const r = await fetch(`https://visual-query-pal.lovable.app/api/image/search?q=${encodeURIComponent(query)}`, {cache:'no-store'});
    if (r.ok) {
      const d = await r.json();
      if (Array.isArray(d?.results)) {
        d.results.forEach(x => {
          const img = x?.thumbnail || x?.image;
          if (img) results.push({ title: x.title || query, url: x.url || x.image, img_src: img, source_name: x.source || 'Web' });
        });
      }
    }
  } catch(_) {}
  try {
    const u=`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=24&prop=imageinfo&iiprop=url|mime&iiurlwidth=640&format=json&origin=*`;
    const r=await fetch(u,{cache:'no-store'});
    const d=r.ok?await r.json():null;
    const wikiImgs=Object.values(d?.query?.pages||{}).map(p=>({title:(p.title||'').replace(/^File:/,''),url:p.imageinfo?.[0]?.descriptionurl||p.imageinfo?.[0]?.url,img_src:p.imageinfo?.[0]?.thumburl||p.imageinfo?.[0]?.url,source_name:'Wikimedia Commons'})).filter(x=>x.img_src);
    const seen=new Set(results.map(x=>x.img_src));
    wikiImgs.forEach(x=>{ if(!seen.has(x.img_src)) results.push(x); });
  } catch(_) {}
  if (results.length) return results;
  return await fetchWikipediaImageFallback(query);
}
async function fetchWikipediaImageFallback(query) {
            try {
                const res = await fetch(`https://ja.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=18&prop=pageimages&pithumbsize=600&format=json&origin=*`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.query?.pages) {
                        return Object.values(data.query.pages)
                            .filter(p => p.thumbnail?.source)
                            .map(p => ({
                                title: p.title,
                                url: `https://ja.wikipedia.org/wiki/${encodeURIComponent(p.title)}`,
                                img_src: p.thumbnail.source,
                                source_name: 'Wikipedia'
                            }));
                    }
                }
            } catch(e) {}
            return [];
        }

        async function fetchNewsMultiAPI(query, page) {
            let results = [];
            try {
                const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ja&gl=JP&ceid=JP:ja`;
                const xmlText = await fetchTextWithProxy(rssUrl);

                if (xmlText) {
                    const parser = new DOMParser();
                    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
                    const items = xmlDoc.querySelectorAll('item');

                    items.forEach(item => {
                        const title = item.querySelector('title')?.textContent || '';
                        const link = item.querySelector('link')?.textContent || '';
                        const pubDate = item.querySelector('pubDate')?.textContent || '';

                        if (title && link) {
                            results.push({
                                title: title,
                                url: link,
                                content: `掲載日時: ${new Date(pubDate).toLocaleString('ja-JP')}`
                            });
                        }
                    });
                }
            } catch(e) {}

            if (results.length === 0) results = await fetchWikipediaSearch(query);
            return results;
        }

        async function fetchWikipediaSearch(query) {
            try {
                const res = await fetch(`https://ja.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*`);
                if(res.ok) {
                    const data = await res.json();
                    if (data.query?.search) {
                        return data.query.search.map(item => ({
                            title: item.title,
                            url: `https://ja.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
                            content: item.snippet.replace(/<\/?[^>]+(>|$)/g, "")
                        }));
                    }
                }
            } catch(e) {}
            return [];
        }

        async function fetchWikipediaKnowledgePanel(query) {
            const sidebar = document.getElementById('sidebar');
            try {
                const res = await fetch(`https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.extract) {
                        sidebar.innerHTML = `
                            <div class="knowledge-card">
                                <div class="knowledge-title">${data.title}</div>
                                <div class="knowledge-subtitle">関連情報 (Wikipedia)</div>
                                <div class="knowledge-desc">${data.extract}</div>
                                <a href="${data.content_urls.desktop.page}" target="_blank" class="knowledge-link">詳細を見る →</a>
                            </div>
                        `;
                        sidebar.classList.add('active');
                        return;
                    }
                }
            } catch (err) {}
            sidebar.classList.remove('active');
        }

        async function fetchOmadaMedia(query, page) {
            const omadaApi = document.getElementById('settingOmadaApi').value || 'https://yt.omada.cafe';
            try {
                const res = await fetch(`${omadaApi}/api/v1/search?q=${encodeURIComponent(query)}&page=${page}&type=video`);
                if (!res.ok) throw new Error();
                const data = await res.json();
                return (Array.isArray(data) ? data : []).map(v => {
                    const isLive = v.isLive === true || v.liveNow === true || (v.lengthSeconds === 0 && !v.isUpcoming);
                    return {
                        title: v.title,
                        videoId: v.videoId,
                        author: v.author || '不明',
                        lengthText: isLive ? 'ライブ' : `${Math.floor((v.lengthSeconds || 0)/60)}分${(v.lengthSeconds || 0)%60}秒`,
                        viewCountText: v.viewCount ? `${v.viewCount.toLocaleString()} 回視聴` : '',
                        isLive: isLive
                    };
                });
            } catch (err) {
                return [];
            }
        }

        async function fetchSideShorts(query) {
            const sidebar = document.getElementById('sidebar');
            const omadaApi = document.getElementById('settingOmadaApi').value || 'https://yt.omada.cafe';
            try {
                const res = await fetch(`${omadaApi}/api/v1/search?q=${encodeURIComponent(query + ' #shorts')}&type=video`);
                if (!res.ok) return;
                const data = await res.json();
                
                const shorts = (Array.isArray(data) ? data : []).filter(v => {
                    const duration = v.lengthSeconds || 0;
                    const isShortTitle = v.title ? v.title.toLowerCase().includes('#shorts') || v.title.toLowerCase().includes('short') : false;
                    return (duration > 0 && duration <= 60) || isShortTitle;
                }).slice(0, 6);

                if (shorts.length === 0) return;

                let shortsHtml = `
                    <div class="knowledge-card">
                        <div class="sidebar-section-title">⚡ ショート動画</div>
                        <div class="shorts-scroll-container">
                `;

                shorts.forEach(s => {
                    const thumbUrl = `https://i.ytimg.com/vi/${s.videoId}/hqdefault.jpg`;
                    shortsHtml += `
                        <div class="short-item-card" onclick="openVideoDetails('${s.videoId}')">
                            <img class="short-item-thumb" src="${thumbUrl}" alt="short" loading="lazy">
                            <div class="short-item-title">${s.title}</div>
                        </div>
                    `;
                });

                shortsHtml += `</div></div>`;

                if (sidebar.innerHTML.includes('video-detail-panel')) {
                    sidebar.insertAdjacentHTML('afterbegin', shortsHtml);
                } else {
                    sidebar.innerHTML = shortsHtml;
                }
                sidebar.classList.add('active');
            } catch (e) {}
        }

        function renderNocookieEmbed(container, videoId) {
            container.innerHTML = `
                <iframe src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1" 
                    style="width:100%; height:220px; border:none; border-radius:8px; background:#000;" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowfullscreen>
                </iframe>
            `;
        }

        async function fetchComments(videoId, targetContainer) {
            const omadaApi = document.getElementById('settingOmadaApi').value || 'https://yt.omada.cafe';
            try {
                const res = await fetch(`${omadaApi}/api/v1/comments/${videoId}`);
                if (!res.ok) throw new Error();
                const data = await res.json();
                const comments = data.comments || [];
                
                if (comments.length === 0) {
                    targetContainer.innerHTML = `<div style="color:var(--text-muted); font-size:12px;">コメントはありません</div>`;
                    return;
                }

                let html = '<div class="comments-list">';
                comments.slice(0, 10).forEach(c => {
                    html += `
                        <div class="comment-item">
                            <div class="comment-author">${c.author}</div>
                            <div class="comment-content">${c.contentHtml || c.content}</div>
                        </div>
                    `;
                });
                html += '</div>';
                targetContainer.innerHTML = html;
            } catch (e) {
                targetContainer.innerHTML = `<div style="color:var(--text-muted); font-size:12px;">コメントを読み込めませんでした</div>`;
            }
        }

        async function openVideoDetails(videoId) {
            const sidebar = document.getElementById('sidebar');
            const omadaApi = document.getElementById('settingOmadaApi').value || 'https://yt.omada.cafe';

            sidebar.innerHTML = `<div class="video-detail-panel"><div style="color:var(--text-muted); font-size:13px;">動画情報を読み込み中...</div></div>`;
            sidebar.classList.add('active');

            let videoData = null;
            try {
                const res = await fetch(`${omadaApi}/api/v1/videos/${videoId}`);
                if (res.ok) videoData = await res.json();
            } catch(e) {}

            let streamUrl = null;
            if (videoData?.formatStreams?.length) {
                streamUrl = videoData.formatStreams[0].url;
            } else {
                streamUrl = `${omadaApi}/latest_version?id=${videoId}&itag=22`;
            }

            const title = videoData ? videoData.title : '動画再生';
            const author = videoData ? videoData.author : '';
            const description = videoData ? (videoData.description || '概要欄はありません。') : '';

            sidebar.innerHTML = `
                <div class="video-detail-panel">
                    <div id="videoPlayerContainer">
                        <video class="video-player-element" style="width:100%; border-radius:8px; background:#000;" controls autoplay src="${streamUrl}" onerror="renderNocookieEmbed(document.getElementById('videoPlayerContainer'), '${videoId}')"></video>
                    </div>
                    <div class="detail-title" style="margin-top:12px;">${title}</div>
                    <div class="detail-author">${author}</div>
                    <div class="detail-desc">${description}</div>

                    <div class="sidebar-section-title">💬 コメント</div>
                    <div id="commentsContainer">
                        <div style="color:var(--text-muted); font-size:12px;">コメント読み込み中...</div>
                    </div>
                </div>
            `;

            fetchSideShorts(currentQuery || title);
            fetchComments(videoId, document.getElementById('commentsContainer'));
        }

        /* 新ショッピングAPI: 楽天市場商品検索 API */
        async function fetchRakutenShoppingAPI(query, page) {
  const appId=document.getElementById('settingRakutenAppId').value||'1018224734614210871';
  const apiUrl=`https://app.rakuten.co.jp/services/api/IchibaItem/Search/20170706?format=json&keyword=${encodeURIComponent(query)}&page=${page}&hits=20&applicationId=${appId}`;
  try{const r=await fetch(apiUrl,{cache:'no-store'});const d=r.ok?await r.json():null;if(d?.Items?.length)return d.Items.map(({Item:item})=>({title:item.itemName,url:item.itemUrl,price:item.itemPrice!=null?`¥${Number(item.itemPrice).toLocaleString()}`:'価格情報なし',img_src:(item.mediumImageUrls?.[0]?.imageUrl||item.smallImageUrls?.[0]?.imageUrl||'').replace('?_ex=128x128','?_ex=300x300'),seller:item.shopName||'楽天市場'}));}catch(_){}
  const q=encodeURIComponent(query);return [{title:query+'を楽天市場で探す',url:`https://search.rakuten.co.jp/search/mall/${q}/`,price:'楽天市場で検索',img_src:'',seller:'楽天市場'},{title:query+'をYahoo!ショッピングで探す',url:`https://shopping.yahoo.co.jp/search?p=${q}`,price:'Yahoo!ショッピングで検索',img_src:'',seller:'Yahoo!ショッピング'},{title:query+'をAmazonで探す',url:`https://www.amazon.co.jp/s?k=${q}`,price:'Amazonで検索',img_src:'',seller:'Amazon'}];
}
async function fetchITunesMusicAPI(query) {
            const apiUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=24&country=JP`;
            try {
                const res = await fetch(apiUrl, { signal: AbortSignal.timeout(2000) });
                if (res.ok) {
                    const data = await res.json();
                    if (data.results) {
                        return data.results.map(song => ({
                            title: song.trackName,
                            artist: song.artistName,
                            album: song.collectionName,
                            img_src: song.artworkUrl100?.replace('100x100bb', '300x300bb') || '',
                            previewUrl: song.previewUrl,
                            url: song.trackViewUrl
                        }));
                    }
                }
            } catch(e) {}
            return [];
        }

        function getDomain(urlStr) {
            try {
                const u = new URL(urlStr);
                return u.hostname.replace('www.', '');
            } catch(e) {
                return 'Web';
            }
        }

        function openImageViewer(index) {
            if (!currentImagesData || !currentImagesData[index]) return;
            activeImageIndex = index;
            const item = currentImagesData[index];
            const domain = item.source_name || getDomain(item.url);
            const faviconUrl = `https://www.google.com/s2/favicons?domain=${getDomain(item.url)}&sz=32`;

            document.getElementById('viewerSiteIcon').src = faviconUrl;
            document.getElementById('viewerSiteName').textContent = domain;
            document.getElementById('viewerMainImg').src = item.img_src;
            document.getElementById('viewerTitle').textContent = item.title;
            document.getElementById('viewerVisitLink').href = item.url;

            const relatedContainer = document.getElementById('viewerRelatedGrid');
            relatedContainer.innerHTML = '';
            
            const relatedImages = currentImagesData.filter((_, i) => i !== index).slice(0, 8);
            let relatedHtml = '';
            relatedImages.forEach((relItem) => {
                const relDomain = relItem.source_name || getDomain(relItem.url);
                const relFavicon = `https://www.google.com/s2/favicons?domain=${getDomain(relItem.url)}&sz=32`;
                const origIndex = currentImagesData.indexOf(relItem);
                relatedHtml += `
                    <div class="image-card" onclick="openImageViewer(${origIndex})">
                        <img src="${relItem.img_src}" loading="lazy" alt="img" onerror="this.src='https://via.placeholder.com/200x150?text=No+Image'">
                        <div class="image-card-info">
                            <div class="image-card-title">${relItem.title}</div>
                            <div class="image-card-source">
                                <img src="${relFavicon}" onerror="this.style.display='none'">
                                <span>${relDomain}</span>
                            </div>
                        </div>
                    </div>
                `;
            });
            relatedContainer.innerHTML = relatedHtml;

            document.getElementById('imageViewerModal').classList.add('active');
        }

        function closeImageViewer() {
            document.getElementById('imageViewerModal').classList.remove('active');
        }

        function navigateViewer(dir) {
            let newIndex = activeImageIndex + dir;
            if (newIndex >= 0 && newIndex < currentImagesData.length) {
                openImageViewer(newIndex);
            }
        }

        function copyViewerLink() {
            if (currentImagesData[activeImageIndex]) {
                navigator.clipboard.writeText(currentImagesData[activeImageIndex].url);
                alert('リンクをコピーしました');
            }
        }

        function renderResults(results, isNextPage, type) {
            const resultsDiv = document.getElementById('results');
            if(!isNextPage) resultsDiv.innerHTML = '';

            if (!results || results.length === 0) {
                if (!isNextPage && resultsDiv.innerHTML === '') {
                    resultsDiv.innerHTML = `<div class="result-item" style="color:var(--text-muted)">検索結果が見つかりませんでした。</div>`;
                }
                hasMoreResults = false;
                return;
            }

            if (type === 'images') {
                if (!isNextPage) currentImagesData = [];
                const startIdx = currentImagesData.length;
                currentImagesData = currentImagesData.concat(results);

                let grid = resultsDiv.querySelector('.image-grid');
                if (!grid) {
                    grid = document.createElement('div');
                    grid.className = 'image-grid';
                    resultsDiv.appendChild(grid);
                }
                let html = '';
                results.forEach((item, i) => {
                    const globalIdx = startIdx + i;
                    const domain = item.source_name || getDomain(item.url);
                    const faviconUrl = `https://www.google.com/s2/favicons?domain=${getDomain(item.url)}&sz=32`;
                    html += `
                        <div class="image-card" onclick="openImageViewer(${globalIdx})">
                            <img src="${item.img_src}" loading="lazy" alt="img" onerror="this.src='https://via.placeholder.com/200x150?text=No+Image'">
                            <div class="image-card-info">
                                <div class="image-card-title">${item.title}</div>
                                <div class="image-card-source">
                                    <img src="${faviconUrl}" onerror="this.style.display='none'">
                                    <span>${domain}</span>
                                </div>
                            </div>
                        </div>
                    `;
                });
                grid.insertAdjacentHTML('beforeend', html);
            } else if (type === 'videos') {
                const fragment = document.createDocumentFragment();
                results.forEach(item => {
                    const thumbUrl = `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`;
                    const card = document.createElement('div');
                    card.className = 'video-card';
                    card.onclick = () => openVideoDetails(item.videoId);
                    
                    const badgeHtml = item.isLive 
                        ? `<div class="live-badge"><span class="live-dot"></span> ライブ</div>` 
                        : '';

                    card.innerHTML = `
                        <div class="video-card-thumb">
                            <img src="${thumbUrl}" alt="thumb" loading="lazy">
                            ${badgeHtml}
                        </div>
                        <div class="video-card-info">
                            <div class="card-title">${item.title}</div>
                            <div class="card-meta">${item.author} • ${item.lengthText} ${item.viewCountText ? '• ' + item.viewCountText : ''}</div>
                        </div>
                    `;
                    fragment.appendChild(card);
                });
                resultsDiv.appendChild(fragment);
            } else if (type === 'shopping') {
                let grid = resultsDiv.querySelector('.shopping-grid');
                if (!grid) {
                    grid = document.createElement('div');
                    grid.className = 'shopping-grid';
                    resultsDiv.appendChild(grid);
                }
                let html = '';
                results.forEach(item => {
                    html += `
                        <a href="${item.url}" class="card" target="_blank">
                            <img src="${item.img_src}" loading="lazy" alt="item" onerror="this.src='https://via.placeholder.com/200x160?text=No+Image'">
                            <div class="card-body">
                                <div class="card-title">${item.title}</div>
                                <div class="card-price">${item.price}</div>
                                <div class="card-meta">${item.seller}</div>
                            </div>
                        </a>
                    `;
                });
                grid.insertAdjacentHTML('beforeend', html);
            } else if (type === 'music') {
                let grid = resultsDiv.querySelector('.music-grid');
                if (!grid) {
                    grid = document.createElement('div');
                    grid.className = 'music-grid';
                    resultsDiv.appendChild(grid);
                }
                let html = '';
                results.forEach(item => {
                    html += `
                        <div class="card">
                            <img src="${item.img_src}" loading="lazy" alt="artwork">
                            <div class="card-body">
                                <a href="${item.url}" target="_blank" class="card-title">${item.title}</a>
                                <div class="card-meta">${item.artist} - ${item.album}</div>
                                <audio controls src="${item.previewUrl}"></audio>
                            </div>
                        </div>
                    `;
                });
                grid.insertAdjacentHTML('beforeend', html);
            } else {
                let html = '';
                results.forEach(item => {
                    html += `
                        <div class="result-item">
                            <a href="${item.url}" class="result-title" target="_blank">${item.title}</a>
                            <div class="result-url">${item.url}</div>
                            <div class="result-snippet">${item.content}</div>
                        </div>
                    `;
                });
                resultsDiv.insertAdjacentHTML('beforeend', html);
            }
        }

        function handleAutoScroll() {
            if (!document.getElementById('search-page').classList.contains('active')) return;
            if (isLoading || !hasMoreResults || !currentQuery) return;
            const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
            if (scrollTop + clientHeight >= scrollHeight - 400) {
                currentPage++;
                executeSearch(true);
            }
        }
    
window.changeCategory = changeCategory;
window.clearSearch = clearSearch;
window.closeAbout = closeAbout;
window.closeImageViewer = closeImageViewer;
window.closeSettings = closeSettings;
window.copyViewerLink = copyViewerLink;
window.navigateViewer = navigateViewer;
window.openAbout = openAbout;
window.openSettings = openSettings;
window.onInputSearch = onInputSearch;
window.handleSearch = handleSearch;
window.selectSuggest = selectSuggest;
window.openImageViewer = openImageViewer;
window.openVideoDetails = openVideoDetails;
window.sxSaveSettings = sxSaveSettings;
})();
        
;

/* =================================================================
   ★ 編集はここだけでOK ★
   下のデータ配列を書き換えるとサイトに反映されます。
   ================================================================= */

// お知らせ（新しいものを上に）
const NEWS = [
  { date:"2026/08/29", cat:"お知らせ", title:"サイトアップデート!!" },
  { date:"2026/08/01", cat:"更新",     title:"LINE本家の追加!?" },
  { date:"2026/08/01", cat:"更新",     title:"MangaRW復活!?" },
  { date:"2026/07/06", cat:"更新",     title:"GAMEのリンクを追加しましたのでみんな仲良くGameしましょう!!" },
  { date:"2026/06/04", cat:"更新",     title:"仲良氏Chat+にアップデート!?" },
  { date:"2026/05/15", cat:"更新",     title:"RammerHead 復活!?" },
  { date:"2026/04/13", cat:"お知らせ", title:'サイトを "Duckdns.org" のPageに移行しました！' },
];

// リンク集（カテゴリごと）
const LINK_CATEGORIES = [
  { title:"YouTubeサイトリンク集 🅝🅔🅦", items:[
    { name:"NKYS Tube Pro ㋔㋜㋜㋱", tag:"YouTube",    url:"https://www.nkys-t-u-be-pr-0.duckdns.org/" },
    { name:"おのTube ㋔㋜㋜㋱",       tag:"YouTube",    url:"https://www.a-xe-t-u-b-e-v-2.duckdns.org/" },
    { name:"INVIDIOUS+ ㋔㋜㋜㋱",    tag:"YouTube",    url:"https://www.inv-pl.duckdns.org/" },
    { name:"チョコTube+ ㋔㋜㋜㋱",    tag:"YouTube",    url:"https://ch-oo-cooo-coo-pl.duckdns.org/" },
    { name:"Wista Pro ㋔㋜㋜㋱",    tag:"YouTube",     url:"https://wista-pro.f5.si/" },
  ]},
  { title:"ゲームリンク集 ", items:[
    { name:"CloudMoon",   tag:"GAMES",   url:"https://3000-ig42ct4o9n1n9j2h01bd0-3c7ff1b5.sandbox.novita.ai/" },
    { name:"CloudMoon2",  tag:"GAMES",   url:"https://cdn.jsdelivr.net/gh/CloudMoonApp/web@main/260605.svg" },
    { name:"Steam Deck",  tag:"GAMES",   url:"https://0yuki0s-deck00c.f5.si/?deck=1" },
    { name:"UBG 66",      tag:"GAMES",   url:"https://unblockedgames1024.gitlab.io/" },
    { name:"UBG+",        tag:"GAMES",   url:"https://unblockedgplus.gitlab.io/game/" },
    { name:"Gnmath",      tag:"GAMES",   url:"https://gn-m-ath-by-2a.duckdns.org/" },
    { name:"TopVAZ",      tag:"GAMES",   url:"https://1v1-lolunblocked.gitlab.io/category/popular.html" },
    { name:"Unpkg Games", tag:"GAMES",   url:"https://script.google.com/macros/s/AKfycbxl4Wntk5jzzwj3wq71m9v33gMqWRGpNEHWtZXXKomLy_ylOVWRPXrPWJEOwn84ONCr/exec" },
    { name:"MANAGEMENT",  tag:"GAMES",   url:"https://cmug.gitlab.io/" },
  ]},
  { title:"その他リンク集", items:[
    { name:"LINE 本家 ㋔㋜㋜㋱",     tag:"Chat",  url:"https://linedayo.onrender.com" },
    { name:"NKYS掲示板 ㋔㋜㋜㋱",    tag:"Chat",  url:"https://script.google.com/a/macros/city.higashiosaka-osk.ed.jp/s/AKfycbyCQGsRPEpFwq1sbQmXk5ABoUZ4E6gpe5A5yfNTMZtfcQb3MgJwXkkzwKrYJ7H7nth5sw/exec" },
    { name:"Manga Raw ㋔㋜㋜㋱",    tag:"Manga",  url:"https://script.google.com/a/macros/city.higashiosaka-osk.ed.jp/s/AKfycbxVgynk7ohSy_bXC_RZl5mdhzb8tF-1F55oDap81FMtgH3m-IjI4oCNSe3-aPFIcFApvg/exec" },
    { name:"Manga Raw 予備 ㋔㋜㋜㋱",tag:"Manga",  url:"https://script.google.com/macros/s/AKfycbzWK0gzlZQ2dy5uV5rnpQYHs78rVJID95IxZ987CMDAg3ChsW4nmKbS--5bSbZ6nnv5Vg/exec" },
    { name:"TripleT HD",           tag:"Movie",  url:"https://triplethd.alexlan.org/" },
    { name:"TripleT HD 予備",       tag:"Movie",  url:"https://triplethd.kiafinans.se/" },
    { name:"9anime",               tag:"ANIME",  url:"https://9anime-meuk.f5.si" },
    { name:"Gomu Raw",             tag:"Manga",  url:"https://mang0-r0w.f5.si/" },
    { name:"モモンガ!",             tag:"R18",  url:"https://momon-ga.f5.si/" },
    { name:"Douzin Plus",          tag:"R18",  url:"https://sennin-douzin-plus.onrender.com/" },
    { name:"PointMarket",          tag:"Search", url:"https://script.google.com/macros/s/AKfycbxNH8zPL3uoCnaB9TLXE-o7sSl3flSyILDo0Jm-J_aGn7J0Siu8Jk6MNm_LJQxod_-FmQ/exec" },
    { name:"StartPage",            tag:"Search", url:"https://www.startpage.com/" },
    { name:"Dazn JP",              tag:"Watch",  url:"https://www.dazn.com/ja-JP/home" },
    { name:"SoundCloak",           tag:"Music",  url:"https://script.google.com/a/macros/city.higashiosaka-osk.ed.jp/s/AKfycby5NSu0bqMm10LvTPyqeY_6o7QwlzlsD_Hwv3bsabN6u1udHtZdhY9P-jHu7m_aMi48/exec" },
    { name:"Individual",           tag:"Chat",  url:"https://script.google.com/a/macros/city.higashiosaka-osk.ed.jp/s/AKfycbzoVIk_PLpyR2U0BREWYY5JulkfL586cMfcDcYZZOB6TxeS4lIxuZ8REH-lzpOi8vcB3w/exec" },
    { name:"KAI-Chat",             tag:"AI",     url:"https://script.google.com/macros/s/AKfycbxfO1SQu_E3Ybd54mIO7knJBtzrrq4hoOa4YzDzNWkPWURjn2mbDiXaFaZXwygWR24A1Q/exec" },
    { name:"Giscord",              tag:"Chat",     url:"https://giscord-v-1-2--nkys-yt-pro.replit.app/" },
  ]},
  { title:"GAME", items:[
    { name:"GTA",           tag:"GAME",       url:"https://script.google.com/macros/s/AKfycbwVMCqNXcXs6ZZRAiRAyO1yz45PMkXNym4n7cV3MVwYwAwtM5U1S8fo9ScG7xJ0Bn5WnQ/exec" },
    { name:"geometry dash", tag:"GAME",       url:"https://script.google.com/macros/s/AKfycbx4MAnwFh0UnUKGq1loS7APoWouzuYpxQFsyGYJnA_MljyJfAlLuzvSzjhKvuXCVNjq/exec" },
    { name:"Hole.io",       tag:"GAME",       url:"https://script.google.com/macros/s/AKfycbx8bBG85RO-3muSRst5LqPvkXatTozmIFn8PBDW9dlKZoo2Xfi24ikqOzLIrQTUOh4jsw/exec" },
    { name:"Drive mad",     tag:"GAME",       url:"https://script.google.com/macros/s/AKfycbwne6h9gqGp-du3JOBhMMzeCf037pnhoaENhwTLw1mJ30QNtnKMhpbnLv-ywYUBTbL1qA/exec" },
    { name:"Granny",        tag:"GAME",       url:"https://script.google.com/macros/s/AKfycbwnjlO8v_tTt0NqMc4kAqFiQWnjpndP1MkGqoTh_R23UZQzqXvQ1pDTPcSe3lDpMHSA4Q/exec" },
    { name:"Sandbox city",  tag:"GAME",       url:"https://crazygames.cdn.msnfun.com/9ncn80572ncc/v9/index.html?msstart_sdk_init=eyJwYXJlbnRPcmlnaW4iOiJodHRwczovL3d3dy5tc24uY29tIiwiY2xpZW50SWQiOiIxRkFCQjFGMDc4Nzk2OEQ1MTlBMEE3RjM3OUQ4NjlCMyIsImxvY2FsZSI6ImVuLXNnIiwiZW50cnlQb2ludElkIjoiIn0" },
    { name:"FRAGEM / FPS",  tag:"GAME",       url:"https://crazygames.cdn.msnfun.com/9nf0clvx79hg/v1/index.html?msstart_sdk_init=eyJwYXJlbnRPcmlnaW4iOiJodHRwczovL3d3dy5tc24uY29tIiwiY2xpZW50SWQiOiIzMEU1Njk0MDg3NTg2MzAyMDU0ODdFMDM4NkEyNjIzOCIsImxvY2FsZSI6ImVuLXVzIiwiZW50cnlQb2ludElkIjoiIiwic3dpdGNoR2FtZVBheWxvYWQiOnsic3dpdGNoZWRUbyI6IjluZjBjbHZ4NzloZyIsInZhbHVlIjp7fX19" },
    { name:"MEGA Shark",    tag:"GAME",       url:"https://inlogic.cdn.msnfun.com/9n08jz7kbjx5/v16/index.html?msstart_sdk_init=eyJwYXJlbnRPcmlnaW4iOiJodHRwczovL3d3dy5tc24uY29tIiwiY2xpZW50SWQiOiIzMEU1Njk0MDg3NTg2MzAyMDU0ODdFMDM4NkEyNjIzOCIsImxvY2FsZSI6ImVuLXVzIiwiZW50cnlQb2ludElkIjoiIiwic3dpdGNoR2FtZVBheWxvYWQiOnsic3dpdGNoZWRUbyI6IjluMDhqejdrYmp4NSIsInZhbHVlIjp7fX19" },
    { name:"ScrewOut...",   tag:"GAME",       url:"https://crazygames.cdn.msnfun.com/9nvd4v66kdj7/v5/index.html?msstart_sdk_init=eyJwYXJlbnRPcmlnaW4iOiJodHRwczovL3d3dy5tc24uY29tIiwiY2xpZW50SWQiOiIzMEU1Njk0MDg3NTg2MzAyMDU0ODdFMDM4NkEyNjIzOCIsImxvY2FsZSI6ImVuLXVzIiwiZW50cnlQb2ludElkIjoiIiwic3dpdGNoR2FtZVBheWxvYWQiOnsic3dpdGNoZWRUbyI6IjludmQ0djY2a2RqNyIsInZhbHVlIjp7fX19" },
    { name:"Ragdoll Ar...", tag:"GAME",       url:"https://crazygames.cdn.msnfun.com/9msvph3r5r2m/v3/index.html?msstart_sdk_init=eyJwYXJlbnRPcmlnaW4iOiJodHRwczovL3d3dy5tc24uY29tIiwiY2xpZW50SWQiOiIzMEU1Njk0MDg3NTg2MzAyMDU0ODdFMDM4NkEyNjIzOCIsImxvY2FsZSI6ImVuLXVzIiwiZW50cnlQb2ludElkIjoiIiwic3dpdGNoR2FtZVBheWxvYWQiOnsic3dpdGNoZWRUbyI6Ijltc3ZwaDNyNXIybSIsInZhbHVlIjp7fX19" },
    { name:"Resent Client", tag:"GAME",       url:"https://r-e-s-e-n-t-cli-en-t.duckdns.org/game.html" },
    { name:"Eaglercraft",   tag:"GAME",       url:"https://2-a-e-agl-er.duckdns.org/" },
    { name:"Eaglercraft 2", tag:"GAME",       url:"https://magurock.f5.si/Play.html" },
  ]},
  { title:"🌐 Proxyリンク集", items:[
    { name:"Interstellar",     tag:"PROXY",   url:"https://elmwoodstudy.s3.amazonaws.com/index.html" },
    { name:"Interstellar 予備", tag:"PROXY",   url:"https://elmwoodstudy.s3.us-east-1.amazonaws.com/index.html" },
    { name:"TungTung",         tag:"PROXY",   url:"https://s3-external-1.amazonaws.com/zoxh/index.html" },
    { name:"TungTung 予備",     tag:"PROXY",   url:"https://zoxh.s3.us-east-1.amazonaws.com/index.html" },
    { name:"Lunar v2",         tag:"PROXY",   url:"https://attt.linco.cl/" },
    { name:"Lunar v2 予備",     tag:"PROXY",   url:"https://kkkkaito.linco.cl/" },
    { name:"arsenic",          tag:"PROXY",   url:"https://arsenic.nana.piragis.net/" },
    { name:"arsenic 予備",      tag:"PROXY",   url:"https://arsenic.nana.mytest.ru/" },
    { name:"Rammer Head",      tag:"PROXY",   url:"https://rammer.nana.3d-mart.ru/" },
    { name:"Rammer Head 予備",  tag:"PROXY",   url:"https://rammer.nana.jonmills.org/" },
    { name:"Dogeub",           tag:"PROXY",   url:"https://canvas-lms.storage.googleapis.com/index.html" },
    { name:"DDX V2",           tag:"PROXY",   url:"https://ddx.v2.nana.konstantin-mauer.de/" },
    { name:"DDX V2 予備",       tag:"PROXY",   url:"https://ddx.v2.nana.bad-domain.info/" },
    { name:"Utopia",           tag:"PROXY",   url:"https://uu.utopia.2a.exe.googleapis.com.hospitaldelninodif.gob.mx/" },
    { name:"Utopia 予備",       tag:"PROXY",   url:"https://u.topia.2a.exe.googleapis.com.hospitaldelninodif.gob.mx" },
    { name:"Petezah",          tag:"PROXY",   url:"https://petezah.nana.arthasarokar.com.np" },
    { name:"Petezah 予備",     tag:"PROXY",   url:"https://petezah.nana.plgsync.com/" },
    { name:"Yuki OS",          tag:"PROXY",   url:"https://yukios.f5.si/" },
  ]},
   { title:"💻 仮想デバイス 🅝🅔🅦", items:[
    { name:"Pixel9 Pro",       tag:"仮想Android",         url:"https://appetize.io/embed/xc1w6f1krd589zhp22a0mgftyw?autoplay=false&debutrue&device=pixel9pro" },
    { name:"Galaxy Tabs7",     tag:"仮想Android",  url:"https://appetize.io/embed/xc1w6f1krd589zhp22a0mgftyw?autoplay=false&debutrue&&device=galaxytabs7&osVersion=26.0&orientation=landscape" },
    { name:"Pixel Tablet",     tag:"仮想Android",  url:"https://appetize.io/embed/xc1w6f1krd589zhp22a0mgftyw?autoplay=false&debutrue&&device=pixeltablet&osVersion=26.0&orientation=landscape" },
    { name:"Windows 96",       tag:"仮想Windows",    url:"https://windows96.net" },
    { name:"Windows 2000",     tag:"仮想Windows",    url:"https://copy.sh/v86/?profile=windows2000" },
    { name:"Google Chrome",    tag:"仮想Google Chrome",   url:"https://stream.offidocs.com/media/system/app/viewnovnc_ext_chromium.php" },
  ]},
];

// ゲーム一覧
const GAMES = [
  { name:"ONLY UP", tag:"GAMES",                     img:"https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2562240/header.jpg?t=1767686251", url:"https://script.google.com/macros/s/AKfycbwMccc783yv5Ftx2nkZ6BpHDi66OYtby8TRsYzgDufHka0zzRHHcV19NgtnFJH0ltbEvQ/exec" },
  { name:"Roblox Barrys Prison", tag:"Horror",        img:"https://www4.minijuegosgratis.com/v3/games/thumbnails/250888_7_sq.jpg", url:"https://script.google.com/macros/s/AKfycbxRR9j9VoEVe3ftwVkqAslFNtnJ1UUWj8hLc51en9qR8fsVz2gho9geBFjasY0IV8gJBQ/exec" },
  { name:"Roblox 99", tag:"Horror",                   img:"https://i.scdn.co/image/ab67616d0000b27354761f903652136279c6552f", url:"https://script.google.com/macros/s/AKfycbw4urIQgR3zAfmFsn3NWFC6kpsGYSWafyi6AWtyVNSyBkySH9O46LVnhej6fW7beFME/exec" },
  { name:"Slender Man", tag:"Horror",                 img:"https://cdn1.epicgames.com/spt-assets/4f2537e2a2124cdd8fbd18b7068167d9/slender-the-arrival-4rvfj.png", url:"https://script.google.com/macros/s/AKfycbzD78lGmoq37iyrMDWZavBLxIRpQ_HmutXT9arsozaDkYaHVSfk7YliEmd3EL4nXM_4Bw/exec" },
  { name:"Poly Track", tag:"GAMES",                  img:"https://lh3.googleusercontent.com/ol_bS9nAl5NvErv-9hX9-MfEMQgtKeFQBb53m5Mh_Uj9fkf5a2S2W_pA43yrnNFGb4UC_GPDTAtCOLRLBjgLHqDFkA=s1280-w1280-h800", url:"https://script.google.com/macros/s/AKfycbzuhv-wKflC3QgCI_d8xsy90ngRlqgKj-qfICMuzhimGuYwWXFI5tPWwwfjrYk-biJu/exec" },
  { name:"N00b miner", tag:"GAMES",                  img:"https://play-lh.googleusercontent.com/yU2xBCEG4x9JJNXj041T8SGRdq2Qos7cgqSOKB1nNOqlx-dDxCpQlVDCuc_YSX-YmJU", url:"https://script.google.com/macros/s/AKfycbxkvPO4mEcWEk5a9TgEuR7qyiYZs7hL80XF5pwK8QMKHqmA7qUqxvIePB3PF9c3Bqc93w/exec" },
  { name:"Fall Guys", tag:"GAMES",                   img:"https://cdn1.epicgames.com/offer/50118b7f954e450f8823df1614b24e80/FGSS04_KeyArt_OfferImagePortrait_1200x1600_1200x1600-4bd46574e78464352e1f2c55714701f7", url:"https://script.google.com/macros/s/AKfycbxzGXZ-dYcADWPNv7OSO6OdaFl8sJtBNY8J1KO5EQ33_I37NN0nQkaej4HqNCAkvxHHqA/exec" },
  { name:"Gun Spin", tag:"GAMES",                    img:"https://say.games/_next/image?url=https%3A%2F%2Fweb-saystore-backend.sgdn.io%2Fgunspiw%2Ficon___bqkktB9DMKoO&w=3840&q=75", url:"https://script.google.com/macros/s/AKfycbzUV7L8dJ4CsDwTGHQA9Bt_xQg7WAYuMbCsGgeVhjMOHycdwG9fJ60dh4_l_q4q_OP2qA/exec" },
  { name:"Slope City", tag:"GAMES",                  img:"https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQTTYSqZcSQo-Wj4Lqq1O7PLTolesXzV9IRJQ&s", url:"https://script.google.com/macros/s/AKfycbyendSzfWzjivGUAoNgH5QDpJIxJDyJvSYwXWxcV_8gl9xkdTMV2BvDpjiWNw5pGaVT/exec" },
  { name:"Among Us", tag:"GAMES",                    img:"https://store-images.s-microsoft.com/image/apps.30063.13589262686196899.16e3418a-cbf2-4748-9724-1c9dc9b7a0b9.672da915-9117-4230-960d-4f59f3d7beb5", url:"https://mirror.turbowarp.xyz/embed?addons=pause&settings-button&hqpen&interpolate#717953555" },
  { name:"Splatoon", tag:"GAMES",                    img:"https://i.ytimg.com/vi/0X_iKZ9sl8w/maxresdefault.jpg", url:"https://mirror.turbowarp.xyz/embed?addons=pause&settings-button&hqpen&interpolate#815938308" },
  { name:"TETRIS", tag:"GAMES",                      img:"https://www.datocms-assets.com/145957/1744284280-tetris-mobile.png?auto=format&fit=max&w=1200", url:"https://mirror.turbowarp.xyz/embed?addons=pause&settings-button&interpolate&clones=Infinity&offscreen&hqpen#1000009994" },
  { name:"大乱闘スマッシュブラザーズ", tag:"GAMES",    img:"https://v1.padlet.pics/1/image.webp?t=c_limit%2Cdpr_1%2Ch_360%2Cw_480&url=https%3A%2F%2Fpadlet-artifacts.storage.googleapis.com%2F772a28a8d4b75d6bf5e784ae9d29c547046e54cb%2F6d587b48e304e2b6dddf1c78a196c1d8-h-eecd7c55129fe0f64ab0d624ee3724c6.png", url:"https://mirror.turbowarp.xyz/embed?addons=pause&settings-button&offscreen&hqpen&interpolate#993930034" },
  { name:"スイカゲーム", tag:"GAMES",                 img:"https://store-jp.nintendo.com/dw/image/v2/BFGJ_PRD/on/demandware.static/-/Sites-all-master-catalog/ja_JP/dw777a27be/products/D70010000043363/heroBanner/d5f672aaf8d60243399b854ffcb11671121f560715505cec327509d6144958cc.jpg?sw=1368&strip=false", url:"https://mirror.turbowarp.xyz/embed?addons=pause&settings-button&hqpen&interpolate#911281961" },
  { name:"Armedforces.io", tag:".io",                img:"https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTLbGVTKPaNajuvDmMvUL1qXSBkerh7uD4jmug97B1rTyuglUegSTRwJls&s=10", url:"https://cmug.gitlab.io/armedforces-io/" },
  { name:"Masked Special Forces", tag:"Shooter",     img:"https://www.onlinegames.io/media/posts/310/Masked-Special-Forces-FPS.jpg", url:"https://cmug.gitlab.io/masked-special-forces/" },
  { name:"Pixel Gun 3D", tag:"Shooter",             img:"https://m.media-amazon.com/images/I/91tio4WA2YL.png", url:"https://unblockedgames1024.gitlab.io/pixel-gun-3d/" },
  { name:"Masked Forces",tag:"Shooter",             img:"https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/555750/capsule_616x353.jpg?t=1768141032", url:"https://unblockedgames1024.gitlab.io/masked-forces/" },
  { name:"ResentClinet", tag:"Minecraft",            img:"https://static.wikitide.net/questforbugswiki/thumb/7/71/Eaglercraft_logo.png/330px-Eaglercraft_logo.png", url:"https://r-e-s-e-n-t-cli-en-t.duckdns.org/game.html" },
  { name:"FRAGEM", tag:"Shooter",                    img:"https://tcf.admeen.org/game/19000/18893/400x246/fragen.jpg", url:"https://crazygames.cdn.msnfun.com/9nf0clvx79hg/v1/index.html?msstart_sdk_init=eyJwYXJlbnRPcmlnaW4iOiJodHRwczovL3d3dy5tc24uY29tIiwiY2xpZW50SWQiOiIzMEU1Njk0MDg3NTg2MzAyMDU0ODdFMDM4NkEyNjIzOCIsImxvY2FsZSI6ImVuLXVzIiwiZW50cnlQb2ludElkIjoiIiwic3dpdGNoR2FtZVBheWxvYWQiOnsic3dpdGNoZWRUbyI6IjluZjBjbHZ4NzloZyIsInZhbHVlIjp7fX19" },
  { name:"Screw Out Bolts and Nuts", tag:"Puzzle",   img:"https://play-lh.googleusercontent.com/Gmy1Fgu07RuM0gFPe_c1F8l8DCT5bEalZLB9o5Avs05L3bUTv2CQRU2OeQKGaAEEkhZeOU7B4N4Ed6BEHDVO", url:"https://crazygames.cdn.msnfun.com/9nvd4v66kdj7/v5/index.html?msstart_sdk_init=eyJwYXJlbnRPcmlnaW4iOiJodHRwczovL3d3dy5tc24uY29tIiwiY2xpZW50SWQiOiIzMEU1Njk0MDg3NTg2MzAyMDU0ODdFMDM4NkEyNjIzOCIsImxvY2FsZSI6ImVuLXVzIiwiZW50cnlQb2ludElkIjoiIiwic3dpdGNoR2FtZVBheWxvYWQiOnsic3dpdGNoZWRUbyI6IjludmQ0djY2a2RqNyIsInZhbHVlIjp7fX19" },
  { name:"Paper.io 2", tag:".io",                    img:"https://assets.funnygames.jp/1/94341/83842/672x448/paperio-2.webp", url:"https://unblockedgames1024.gitlab.io/paper-2-io/" },
  { name:"Cookie Clicker", tag:"Clicker",            img:"https://image.yoyaku-top10.jp/uploads/product_image/image/2119/8/webp_40550f98-0c2a-4c33-8551-d881801d1997.webp", url:"https://script.google.com/macros/s/AKfycbwBqXgNdPvUhBVIMNezaJWTtAaciacXART1MmryZHkWjOmAMATz48ZB3qMmuFSNlWJf/exec" },
  { name:"Geometry Dash", tag:"GAMES",               img:"https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS0zbxFSY_cj0J1bY_Hg_zW1L9HOQ4moJTyiaxroQ31FA&s", url:"https://script.google.com/macros/s/AKfycbyoZOqEbPe_4u9raPNfAJnIF3IGdlQhAKDpcHYcMmm9AlnKdPkqjReDovHJF-GMul8A/exec" },
  { name:"Drive Mad", tag:"Horror",                  img:"https://img.poki-cdn.com/cdn-cgi/image/q=78,scq=50,width=1200,height=1200,fit=cover,f=png/fb51b7a3920196f313f2d1b081a98e2e/drive-mad-logo.png", url:"https://script.google.com/macros/s/AKfycbxEewkW5fvbDS7Ol8v5bH8pQrJ6aATe_QLDgrTILDmHlln8Lel6ZyAPAk1hRheZXxGH-A/exec" },
  { name:"DYPING", tag:"Horror",                     img:"https://playism.com/wp-content/uploads/2026/02/01_%E3%82%AD%E3%83%BC%E3%83%93%E3%82%B8%E3%83%A5%E3%82%A2%E3%83%AB.png", url:"https://script.google.com/macros/s/AKfycby-yRu226xApn5nu3Tr_qIcMwQEi-lpHL4nD0I5tXMcJ6Sn-jp3-NPMwvE4wBTF0k9L/exec" },
  { name:"R.E.P.O", tag:"Horror",                    img:"https://sc.filehippo.net/images/t_app-icon-l/p/a8dc6518-c07f-47e0-a37a-de302a8793dd/482813549/repo-logo", url:"https://script.google.com/macros/s/AKfycbw7cYqi0QKc4z68fGCBddPXKU8Mv-kh9UWFlYawSSmldLF_s7MUQBZkYRbWeyantriu/exec" },
  { name:"Super Mario 64", tag:"GAMES",              img:"https://upload.wikimedia.org/wikipedia/en/thumb/e/e9/Super_Mario_64.png/250px-Super_Mario_64.png", url:"https://script.google.com/macros/s/AKfycbyToYqZyNF9gt9auaycGWHDjw9ye__qU315r0fvaQv0W5wM147qJeRzB_m40bSlF5dh/exec" },
  { name:"ブロスタ", tag:"Shooter",                   img:"https://games.app-liv.jp/images/articles/2018/12/gd_388601_-1.jpg", url:"https://script.google.com/macros/s/AKfycbwALAHTtNRX7ZyF3nbaghgBHvvG4DzR7cj3FCWz08i4EQIS-bUZbR8FTOdVe58D6r5q7Q/exec" },
  { name:"2048", tag:"Puzzle",                       img:"https://imgs.crazygames.com/games/2048/cover_1x1-1707828857318.png?format=auto&quality=100&metadata=none&width=1200", url:"https://script.google.com/macros/s/AKfycbwLIlqQrmq1_R1bGBo_pHIi0OaRI96Eph4Fw7aE118E5WFRCJm-q-1DmvR8T1nSBSqZhA/exec" },
  { name:"Cobb can Move", tag:"Horror",              img:"https://slopegame2.com/data/image/Cobb-Can-Move.jpg", url:"https://script.google.com/macros/s/AKfycbze6Yjc9BM5IVNfiK-V9686wtB5Tx5gqdTvaKRR5bD30Qn4sFeqyjsVYrLgTSeW6aIs/exec" },
  { name:"Chiikawa Puzzle", tag:"Puzzle",            img:"https://img.itch.zone/aW1nLzIzMjg3OTkxLnBuZw==/original/9ZQMfo.png", url:"https://script.google.com/macros/s/AKfycbxIiFrheM_xpeehrgVyaR7t0fSxz9mbmnm4bK3Bk-_Xfl1n3M25hc9W_XLk0WaEXhz8/exec" },
  { name:"Suvaival.io", tag:".io",                   img:"https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQVbVU_PJPur8N4QhfyDP6pzERkgA-b9051cY1smJ2dnG_JWqtZmKk3wxQ0&s=10", url:"https://script.google.com/macros/s/AKfycbyqcdaA34mwBxA1PIMB3ln8dVnRCdVsPBj85W_NrBRoDmauVDEdWfRJOhuxDajwdo6Z/exec" },
  { name:"BLOCK BLAST", tag:"Puzzle",                img:"https://cdn2.fptshop.com.vn/unsafe/1240x0/filters:format(webp):quality(75)/block_blast_6_45a3799a1b.jpg", url:"https://script.google.com/macros/s/AKfycbycxjNgTna7FyTV-LgTQD7Jq2hCCSG-1pajHuYuf1SwQWwcAbfTUEU8SrQCwTqJee4/exec" },
  { name:"GTA", tag:"GAMES",                         img:"https://i.ytimg.com/vi/axY9GOqGYgA/maxresdefault.jpg", url:"https://script.google.com/macros/s/AKfycbwLMXCMH4RQVPyEj5PM4-GePOFbCt542Yq61vjEOPSsyyr9CsPOjtDCCr3BY_Szc5Bl7g/exec" },
  { name:"Hole.io", tag:".io",                       img:"https://m.media-amazon.com/images/I/81QTJgqpy9L.png", url:"https://script.google.com/macros/s/AKfycbxaEAALDwIyOO0i5pMcGew37mv-rHB9kydmlRfjewcmCjDwMOy4E703WwEgSQKOujJS5A/exec" },
  { name:"Magic Tiles 3", tag:"Pazzle",              img:"https://magictiles.org/game/magic-tiles-3.webp", url:"https://script.google.com/macros/s/AKfycbytKeNBxJWqOKQQmuX6-T99F1vpLYUfuo6qD9IwrqilXk4gSaGPhoY7h1rp-mdq3Rts/exec" },
  { name:"Sonic EXE", tag:"Horror",                  img:"https://cdn2.steamgriddb.com/logo/31c660c9bfd19dc8145532f33b9dc187.png", url:"https://script.google.com/macros/s/AKfycbzTL1fwvNcRcdaLXcEFo6LIKe6ocPfGanvahDpfRGrg0_FytIvULo8qxZWJsgVX3geHGg/exec" },
  { name:"Rogue Ser...", tag:"Shooter",              img:"https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTuVN9CgBy5hRuTi8xPiW8iX-PLx0_WiIG3ZG_I8zbSgcdXkZrnbhk9Z0U&s=10", url:"https://script.google.com/macros/s/AKfycbxoO6zDi8mk7Ef1vm0lr1_4fRRw1qbLcW3ViDjP6YIywNUXN-OFK6HXE4T_gaGMIcCcjg/exec" },
  { name:"Ragdoll Hit", tag:"GAMES",                 img:"https://media.hotgame.io/2026/01/01210043/ragdoll-hit-enhanced.webp", url:"https://script.google.com/macros/s/AKfycbwgrxZmuFfIKSLNgcOMbaP_AqIp0Cw1o3ZPd7ZeXcltvZDWu6--UY3RPoIUhv1n1MCBxQ/exec" },

];

// ティッカー表示データ（APIで更新）
let EQ_ITEMS = ["地震情報を読み込み中..."];
let NEWS_ITEMS = NEWS.map(n => `${n.date} ${n.title}`);

function renderTicker(){
  const move = document.getElementById('tickerMove');
  if(!move) return;
  const eqParts = EQ_ITEMS.map(t => `<span class="ticker-item"><span class="dot" style="width:7px;height:7px;border-radius:50%;background:#ff6b5b;display:inline-block"></span>${t}</span>`).join('');
  const newsParts = NEWS_ITEMS.map(t => `<span class="ticker-item">${t}</span>`).join('');
  const cycle = eqParts + newsParts;
  move.innerHTML = cycle + cycle;
}

function scaleToShindo(s){
  const map = {10:'1',20:'2',30:'3',40:'4',45:'5弱',50:'5強',55:'6弱',60:'6強',70:'7'};
  return map[s] || '';
}

// P2P地震情報 API から実際の地震情報を取得（速報 + 詳細一覧）
let QUAKES = []; // 正規化した地震データ
async function fetchQuakes(force){
  if(window.__quakeBusy) return; window.__quakeBusy = true;
  try{
    let data = null;
    const endpoints = [
      'https://api.p2pquake.net/v2/history?codes=551&limit=100',
      'https://api.p2pquake.net/v2/jma/quake?limit=100'
    ];
    for(const ep of endpoints){
      try{
        const res = await fetchTimeout(ep, 6000, { cache:'no-store' });
        if(!res.ok) continue;
        const j = await res.json();
        if(Array.isArray(j) && j.length){ data = j; break; }
      }catch(_){}
    }
    if(!data) throw new Error('API error');
    QUAKES = data.map(d => {
      const eq = d.earthquake || {};
      const h = eq.hypocenter || {};
      return {
        time: (eq.time || d.time || '').replace(/-/g,'/'),
        place: h.name || '震源不明',
        lat: (h.latitude != null && h.latitude !== -200) ? h.latitude : null,
        lng: (h.longitude != null && h.longitude !== -200) ? h.longitude : null,
        mag: (h.magnitude != null && h.magnitude !== -1) ? h.magnitude : null,
        depth: (h.depth != null && h.depth !== -1) ? h.depth : null,
        maxScale: eq.maxScale != null ? eq.maxScale : 0,
        tsunami: eq.domesticTsunami || 'Unknown',
        points: Array.isArray(d.points) ? d.points : [],
      };
    }).filter(q => q.time)
      // 日本国内の地震だけに限定（座標があるものは日本の範囲内のみ）
      .filter(q => (q.lat == null || q.lng == null) || (q.lat >= 24 && q.lat <= 46 && q.lng >= 122 && q.lng <= 146));
    // APIの返却順に依存せず、発生時刻が新しい順になるよう必ず並び替える
    QUAKES.sort((a,b) => new Date(b.time) - new Date(a.time));

    // ティッカー更新
    EQ_ITEMS = QUAKES.slice(0,6).map(q => {
      const sh = scaleToShindo(q.maxScale);
      return `${q.time.slice(5,16)} ${q.place} ${q.mag!=null?'M'+q.mag:''}${sh?' 最大震度'+sh:''}`;
    });
    if(!EQ_ITEMS.length) EQ_ITEMS = ["現在、地震に関する情報はありません。"];
    const sig = QUAKES.length + '|' + (QUAKES[0] ? QUAKES[0].time + QUAKES[0].place + QUAKES[0].maxScale : '');
    if(!force && sig === window.__quakeSig){
      const up0 = document.getElementById('eqUpdated');
      if(up0) up0.textContent = '最終更新: ' + new Date().toLocaleTimeString('ja-JP');
      window.__quakeBusy = false;
      return;
    }
    window.__quakeSig = sig;
  }catch(e){
    if(!QUAKES.length) EQ_ITEMS = ["地震情報を取得できませんでした。"];
  }
  renderTicker();
  buildPrefOptions();
  renderQuakeHome();
  renderQuakeList();
  if(isMapPageActive()) ensureLeaflet().then(() => { try{ renderQuakeMap(); }catch(e){} });
  if(typeof renderEarthquakeMonitor === 'function') renderEarthquakeMonitor();
  window.__quakeBusy = false;
  const up = document.getElementById('eqUpdated');
  if(up) up.textContent = '最終更新: ' + new Date().toLocaleTimeString('ja-JP');
}

function eqShindoBox(scale){
  const sh = scaleToShindo(scale) || '—';
  return `<div class="eq-shindo s${scale||10}"><small>震度</small><b>${sh}</b></div>`;
}
function tsunamiText(t){
  if(t==='None') return '津波の心配なし';
  if(t==='Watch') return '津波注意報';
  if(t==='Warning') return '津波警報';
  return '';
}

function renderQuakeHome(){
  const el = document.getElementById('eqListHome');
  if(!el) return;
  if(!QUAKES.length){ el.innerHTML = '<div class="eq-empty">地震情報を取得できませんでした。</div>'; return; }
  el.innerHTML = QUAKES.slice(0,3).map(q => quakeItemHtml(q)).join('');
}

function quakeItemHtml(q, hit){
  const ts = tsunamiText(q.tsunami);
  return `<div class="eq-item">
    ${eqShindoBox(q.maxScale)}
    <div class="eq-meta">
      <p class="eq-place">${q.place}</p>
      <div class="eq-sub">
        <span>🕒 ${q.time.slice(0,16)}</span>
        ${q.mag!=null?`<span>規模 M${q.mag}</span>`:''}
        ${q.depth!=null?`<span>深さ ${q.depth}km</span>`:''}
        ${ts?`<span>${ts}</span>`:''}
      </div>
      ${hit?`<div class="eq-hit">${hit}</div>`:''}
    </div>
  </div>`;
}

// 都道府県・市区町村フィルタ
function buildPrefOptions(){
  const sel = document.getElementById('eqPref');
  if(!sel || sel.dataset.built) return;
  const prefs = [...new Set(QUAKES.flatMap(q => q.points.map(p => p.pref)).filter(Boolean))].sort();
  if(!prefs.length) return;
  sel.innerHTML = '<option value="">▼ 都道府県を選択</option>' + prefs.map(p => `<option value="${p}">${p}</option>`).join('');
  sel.dataset.built = '1';
}
function onPrefChange(){
  const pref = document.getElementById('eqPref').value;
  const citySel = document.getElementById('eqCity');
  if(pref){
    const cities = [...new Set(QUAKES.flatMap(q => q.points.filter(p => p.pref===pref).map(p => p.addr)).filter(Boolean))].sort();
    citySel.innerHTML = '<option value="">▼ 市区町村を選択（全て）</option>' + cities.map(c => `<option value="${c}">${c}</option>`).join('');
  }else{
    citySel.innerHTML = '<option value="">▼ 市区町村を選択</option>';
  }
  renderQuakeList();
}
function resetEqFilter(){
  const p = document.getElementById('eqPref'); if(p) p.value='';
  const c = document.getElementById('eqCity'); if(c) c.innerHTML='<option value="">▼ 市区町村を選択</option>';
  renderQuakeList();
}
function renderQuakeList(){
  const el = document.getElementById('eqListAll');
  if(!el) return;
  const pref = (document.getElementById('eqPref')||{}).value || '';
  const city = (document.getElementById('eqCity')||{}).value || '';
  let list = QUAKES;
  if(pref){
    list = QUAKES.filter(q => q.points.some(p => p.pref===pref && (!city || p.addr===city)));
  }
  if(!list.length){
    el.innerHTML = '<div class="eq-empty">該当する地震の記録は見つかりませんでした。</div>';
    return;
  }
  el.innerHTML = list.slice(0,50).map(q => {
    let hit = '';
    if(pref){
      const pts = q.points.filter(p => p.pref===pref && (!city || p.addr===city));
      if(pts.length){
        const mx = Math.max(...pts.map(p => p.scale||0));
        const where = city || pref;
        hit = `📍 ${where}：観測震度 ${scaleToShindo(mx)||'—'}`;
      }
    }
    return quakeItemHtml(q, hit);
  }).join('');
  if(isMapPageActive()) ensureLeaflet().then(() => { try{ renderQuakeMap(); }catch(e){} });
}


// 地震マップ（Leaflet + OSM）
let QUAKE_MAP = null;
let QUAKE_MARKERS = [];
function shindoColor(scale){
  if(scale>=70) return '#7e22ce';
  if(scale>=60) return '#b91c1c';
  if(scale>=50) return '#dc2626';
  if(scale>=40) return '#f59e0b';
  if(scale>=30) return '#eab308';
  if(scale>=20) return '#22c55e';
  return '#3b82f6';
}
function renderQuakeMap(){
  const el = document.getElementById('quakeMap');
  if(!el || typeof L === 'undefined') return;
  if(!QUAKE_MAP){
    QUAKE_MAP = L.map(el, { scrollWheelZoom:false }).setView([37.5, 138.0], 5);
    // 地図タイルは使用せず、ページ内SVGモニターを利用します。
  }
  // 既存マーカー削除
  QUAKE_MARKERS.forEach(m => QUAKE_MAP.removeLayer(m));
  QUAKE_MARKERS = [];

  const pref = (document.getElementById('eqPref')||{}).value || '';
  const city = (document.getElementById('eqCity')||{}).value || '';
  let list = QUAKES;
  if(pref){
    list = QUAKES.filter(q => q.points.some(p => p.pref===pref && (!city || p.addr===city)));
  }
  const shown = list.slice(0, 30).filter(q => q.lat != null && q.lng != null);
  const bounds = [];
  shown.forEach((q, idx) => {
    const color = shindoColor(q.maxScale || 0);
    const radius = 6 + Math.min(14, (q.maxScale||10)/6);
    const marker = L.circleMarker([q.lat, q.lng], {
      radius: radius,
      color: '#fff',
      weight: 2,
      fillColor: color,
      fillOpacity: idx === 0 ? 0.95 : 0.65
    }).addTo(QUAKE_MAP);
    const sh = scaleToShindo(q.maxScale) || '—';
    marker.bindPopup(`<div class="eq-map-popup"><b>${q.place}</b><br>🕒 ${q.time.slice(0,16)}<br>${q.mag!=null?'規模 M'+q.mag+' ':''}${q.depth!=null?'深さ '+q.depth+'km':''}<br>最大震度 <b>${sh}</b></div>`);
    QUAKE_MARKERS.push(marker);
    bounds.push([q.lat, q.lng]);
  });
  if(shown.length && shown[0]){
    // 最新震央を開く
    QUAKE_MARKERS[0].openPopup();
  }
  if(pref && bounds.length){
    QUAKE_MAP.fitBounds(bounds, { padding:[30,30], maxZoom:8 });
  } else {
    QUAKE_MAP.setView([37.5, 138.0], 5);
  }
  setTimeout(() => QUAKE_MAP.invalidateSize(), 100);
}

// タイムアウト付きfetch（応答のない経路でいつまでも待たされないようにする）
async function fetchTimeout(url, ms, opts){
  const ctrl = new AbortController();
  const id = setTimeout(()=>ctrl.abort(), ms);
  try{
    return await fetch(url, { ...(opts||{}), signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

/* =================================================================
   ↓ 以下、レンダリングと既存機能（基本いじらなくてOK）
   ================================================================= */

// 日付
const t = new Date();
document.getElementById('today').textContent =
  `${t.getFullYear()}/${String(t.getMonth()+1).padStart(2,'0')}/${String(t.getDate()).padStart(2,'0')}`;

// リアルタイム時計（HH:MM:SS）
let CLOCK_FORMAT = '24';
function changeClockFormat(v){
  CLOCK_FORMAT = (v === 'ampm') ? 'ampm' : '24';
  saveSettings({ clockFormat: CLOCK_FORMAT });
  renderClock();
}
function renderClock(){
  const el = document.getElementById('clock');
  if(!el) return;
  const pad = n => String(n).padStart(2,'0');
  const d = new Date();
  let h = d.getHours();
  const m = pad(d.getMinutes());
  const sec = pad(d.getSeconds());
  if(CLOCK_FORMAT === 'ampm'){
    const suf = h >= 12 ? 'PM' : 'AM';
    let hh = h % 12; if(hh === 0) hh = 12;
    el.textContent = `${pad(hh)}:${m}:${sec} ${suf}`;
  } else {
    el.textContent = `${pad(h)}:${m}:${sec}`;
  }
}
renderClock();
setInterval(()=>{ if(!document.hidden) renderClock(); }, 1000);

// 訪問者カウンター
setTimeout(()=>{ if(typeof window.initVisitorCounter==='function') window.initVisitorCounter(); },0);

// ニュース描画
function renderNews(){
  const html = NEWS.map(n=>{
    const cls = n.cat==='更新' ? 'cat update' : 'cat';
    return `<li><span class="date">${n.date}</span><span class="${cls}">${n.cat}</span><span class="title">${n.title}</span></li>`;
  }).join('');
  document.getElementById('newsListHome').innerHTML = html;
  document.getElementById('newsListAll').innerHTML = html;
  document.getElementById('recentNews').innerHTML =
    NEWS.slice(0,4).map(n=>`<li><div class="muted" style="font-size:.75rem">${n.date}</div>${n.title}</li>`).join('');
}

// 通知（お知らせ）
const NOTIF_KEY = 'nakayosi_notif_lastseen_v1';
function getLastSeen(){ try{ return localStorage.getItem(NOTIF_KEY) || ''; }catch(e){ return ''; } }
function setLastSeen(v){ try{ localStorage.setItem(NOTIF_KEY, v); }catch(e){} }
function renderNotif(){
  const list = document.getElementById('notifList');
  const btn  = document.getElementById('notifBtn');
  if(!list || !btn) return;
  const lastSeen = getLastSeen();
  let hasNew = false;
  list.innerHTML = NEWS.slice(0,8).map(n=>{
    const isNew = !lastSeen || n.date > lastSeen;
    if(isNew) hasNew = true;
    return `<li class="${isNew?'new':''}"><span class="np-date">${n.date}${isNew?'<span class="np-badge">NEW</span>':''}</span>${n.title}</li>`;
  }).join('') || '<li style="color:var(--text-muted)">お知らせはありません</li>';
  btn.classList.toggle('has-new', hasNew);
  const dot = document.getElementById('notifDot');
  if(dot) dot.style.display = hasNew ? '' : 'none';
}
function markNotifRead(){
  const latest = NEWS.map(n=>n.date).sort().pop();
  if(latest) setLastSeen(latest);
  const btn = document.getElementById('notifBtn');
  if(btn) btn.classList.remove('has-new');
  const dot = document.getElementById('notifDot');
  if(dot) dot.style.display = 'none';
}
function toggleNotif(e){
  if(e) e.stopPropagation();
  const panel = document.getElementById('notifPanel');
  const wasOpen = panel.classList.contains('open');
  panel.classList.toggle('open');
  if(!wasOpen){
    // 開いた（確認した）時点で既読 → 赤丸を消す
    markNotifRead();
    renderNotif();
    markNotifRead();
  }
}
function closeNotif(){
  const panel = document.getElementById('notifPanel');
  if(panel) panel.classList.remove('open');
}
document.addEventListener('click', (e)=>{
  const wrap = document.querySelector('.notif-wrap');
  if(wrap && !wrap.contains(e.target)) closeNotif();
});


// リンク描画
var ACTIVE_LINK_TAG = 'ALL';
var LINK_QUERY = '';
const LINK_CATEGORY_ICONS = ['▦','▶','◆','●','★','◇','▣'];
function safeText(value){
  return String(value == null ? '' : value).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
function linkDomain(url){
  try { return new URL(url).hostname.replace(/^www\./,''); } catch(e) { return 'リンク先を開く'; }
}
function linkInitial(name){
  const clean = String(name || '').replace(/[㋔🅝🅔🅦!+]/g,'').trim();
  return (clean.charAt(0) || '↗').toUpperCase();
}
function renderLinks(){
  const allTags = Array.from(new Set(LINK_CATEGORIES.flatMap(c => c.items.map(i => i.tag).filter(Boolean))));
  const total = LINK_CATEGORIES.reduce((n,c)=>n+c.items.length,0);
  const tagBar = document.getElementById('linkTagBar');
  if(tagBar) tagBar.innerHTML = ['ALL',...allTags].map(t => `<button type="button" class="tag-chip${t===ACTIVE_LINK_TAG?' active':''}" data-tag="${safeText(t)}" onclick="filterLinksByTag('${String(t).replace(/'/g,"\\'")}')">${t==='ALL'?'すべて':safeText(t)}</button>`).join('');
  const cats = document.getElementById('linkCats');
  if(cats) cats.innerHTML = LINK_CATEGORIES.map((cat,index)=>`<section class="link-cat" data-cat="${safeText(cat.title)}"><div class="link-cat-head"><span class="link-cat-mark">${LINK_CATEGORY_ICONS[index%LINK_CATEGORY_ICONS.length]}</span><div class="link-cat-title"><h2>${safeText(cat.title)}</h2><div class="link-cat-sub">${cat.items.length} links</div></div></div><ul>${cat.items.map(i=>`<li><a href="${safeText(i.url)}" target="_blank" rel="noopener noreferrer" data-name="${safeText(i.name)}" data-tag="${safeText(i.tag||'')}" data-url="${safeText(i.url)}" data-initial="${safeText(linkInitial(i.name))}"><span class="link-info"><span class="lk-name">${safeText(i.name)}</span><span class="lk-domain">${safeText(linkDomain(i.url))}</span></span><span class="link-trailing">${i.tag?`<span class="lk-tag lk-tag-${String(i.tag).replace(/\s+/g,'-').toLowerCase()}">${safeText(i.tag)}</span>`:''}<svg class="link-open-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8"/><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></span></a></li>`).join('')}</ul></section>`).join('');
  const count = document.getElementById('linkCount'); if(count) count.textContent = total;
  applyLinkFilters();
}
function filterLinksByTag(tag){ ACTIVE_LINK_TAG=tag; applyLinkFilters(); }
function filterLinks(q){
  LINK_QUERY=String(q||'').trim().toLowerCase();
  const local=document.getElementById('linkSearchInput');
  if(local && local.value!==q) local.value=q;
  if(LINK_QUERY && !document.getElementById('links-page').classList.contains('active')) showPage('links');
  applyLinkFilters();
}
function clearLinkSearch(){
  const input=document.getElementById('linkSearchInput'); if(input){input.value='';input.focus();}
  const global=document.getElementById('searchInput'); if(global) global.value='';
  LINK_QUERY=''; applyLinkFilters();
}
function applyLinkFilters(){
  let shown=0;
  document.querySelectorAll('#linkTagBar .tag-chip').forEach(b=>b.classList.toggle('active',b.dataset.tag===ACTIVE_LINK_TAG));
  document.querySelectorAll('#linkCats .link-cat').forEach(cat=>{
    let visible=0;
    cat.querySelectorAll('li').forEach(li=>{
      const a=li.querySelector('a');
      const hay=[a.dataset.name,a.dataset.tag,a.dataset.url].join(' ').toLowerCase();
      const ok=(ACTIVE_LINK_TAG==='ALL'||a.dataset.tag===ACTIVE_LINK_TAG)&&(!LINK_QUERY||hay.includes(LINK_QUERY));
      li.style.display=ok?'':'none'; if(ok){visible++;shown++;}
    });
    cat.style.display=visible?'':'none';
  });
  const host=document.getElementById('linkCats');
  let empty=document.getElementById('linkEmpty');
  if(shown===0&&host){if(!empty){empty=document.createElement('div');empty.id='linkEmpty';empty.className='link-empty';empty.innerHTML='<div class="link-empty-icon">⌕</div><strong>リンクが見つかりません</strong><span>検索語や絞り込みを変えてみてください。</span>';host.appendChild(empty);}empty.style.display='block';}else if(empty) empty.style.display='none';
  const result=document.getElementById('linkResultCount'); if(result) result.innerHTML=`<strong>${shown}</strong> 件を表示`;
  const clear=document.getElementById('linkSearchClear'); if(clear) clear.classList.toggle('visible',!!LINK_QUERY);
}

// ゲーム描画 (CrazyGames風)
window.TAG_ICONS = {
  'GAMES': '<svg class="category-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8h10a4 4 0 0 1 3.8 5.2l-1 3.2a2.2 2.2 0 0 1-4.1.4L15 15H9l-.7 1.8a2.2 2.2 0 0 1-4.1-.4l-1-3.2A4 4 0 0 1 7 8Z"/><path d="M8 11v4M6 13h4M16.5 12.5h.01M18.5 14.5h.01"/></svg>',
  '.io': '<svg class="category-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M8 15c2-5 6-5 8-6M8 9c2 5 6 5 8 6"/></svg>',
  'Shooter': '<svg class="category-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h10l3 3-3 3H4l2-3-2-3Z"/><path d="M17 12h3M7 9V7M9 9V6"/></svg>',
  'Puzzle': '<svg class="category-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h5v3a2 2 0 1 0 4 0V5h5v5h-3a2 2 0 1 0 0 4h3v5h-5v-3a2 2 0 1 0-4 0v3H5v-5h3a2 2 0 1 0 0-4H5V5Z"/></svg>',
  'Horror': '<svg class="category-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4c-4.5 0-7 3.4-7 8.2 0 4.2 2.5 7.8 7 7.8s7-3.6 7-7.8C19 7.4 16.5 4 12 4Z"/><path d="M9 11h.01M15 11h.01M9 16c2-1 4-1 6 0"/></svg>',
  'Minecraft': '<svg class="category-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 8 7-4 7 4v8l-7 4-7-4V8Z"/><path d="m5 8 7 4 7-4M12 12v8M9 6l7 4"/></svg>',
  'Clicker': '<svg class="category-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4v8l2-2V5a1 1 0 0 1 2 0v5l1-1a1 1 0 0 1 2 1v1l1-1a1 1 0 0 1 2 1v4c0 4-2 6-6 6h-1c-3 0-5-2-5-5V9a1 1 0 0 1 2 0Z"/></svg>'
};
var CG_ACTIVE_TAG = 'ALL';
function renderGames(){
  const playSvg = '<span class="play-badge" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>';
  const cardHtml = (g, i) => `
    <div class="game-card" onclick="openGame('${g.url.replace(/'/g,"\\'")}','${g.name.replace(/'/g,"\\'")}')" role="button" tabindex="0" aria-label="${g.name}" data-tag="${g.tag||''}">
      <div class="thumb">
        ${i < 3 ? '<span class="hot-tag">HOT</span>' : ''}
        <img src="${g.img}" alt="${g.name}" loading="lazy">
        ${playSvg}
        <div class="name">${g.name}</div>
      </div>
    </div>`;

  // Home grid: top 8 with HOT badges
  const homeEl = document.getElementById('gameGridHome');
  if(homeEl) homeEl.innerHTML = GAMES.slice(0,8).map((g,i)=>cardHtml(g,i)).join('');

  // Tag chips
  const tags = ['ALL', ...Array.from(new Set(GAMES.map(g => g.tag).filter(Boolean)))];
  const chipsEl = document.getElementById('cgChips');
  if(chipsEl){
    chipsEl.innerHTML = tags.map(t => `<button class="cg-chip${t===CG_ACTIVE_TAG?' active':''}" onclick="filterGamesByTag('${t}')">${t==='ALL'?'<span class="category-icon-wrap"><svg class="category-icon" viewBox="0 0 24 24"><path d="M7 8h10a4 4 0 0 1 3.8 5.2l-1 3.2a2.2 2.2 0 0 1-4.1.4L15 15H9l-.7 1.8a2.2 2.2 0 0 1-4.1-.4l-1-3.2A4 4 0 0 1 7 8Z"/><path d="M8 11v4M6 13h4M16.5 12.5h.01M18.5 14.5h.01"/></svg></span>すべて':(window.TAG_ICONS[t]||'')+' '+t}</button>`).join('');
  }
  const catsEl = document.getElementById('cgCats');
  if(catsEl){
    catsEl.innerHTML = tags.map(t => `<li><button class="cg-cat${t===CG_ACTIVE_TAG?' active':''}" onclick="filterGamesByTag('${t}')">${t==='ALL'?'<span class="category-icon-wrap"><svg class="category-icon" viewBox="0 0 24 24"><path d="M7 8h10a4 4 0 0 1 3.8 5.2l-1 3.2a2.2 2.2 0 0 1-4.1.4L15 15H9l-.7 1.8a2.2 2.2 0 0 1-4.1-.4l-1-3.2A4 4 0 0 1 7 8Z"/><path d="M8 11v4M6 13h4M16.5 12.5h.01M18.5 14.5h.01"/></svg></span>すべて':(window.TAG_ICONS[t]||'')+' '+t} <span class="cg-count">${t==='ALL'?GAMES.length:GAMES.filter(g=>g.tag===t).length}</span></button></li>`).join('');
  }

  // Hero: featured (first game)
  const heroEl = document.getElementById('cgHero');
  if(heroEl && GAMES.length){
    const h = GAMES[0];
    heroEl.innerHTML = `
      <div class="cg-hero-card" onclick="openGame('${h.url.replace(/'/g,"\\'")}','${h.name.replace(/'/g,"\\'")}')" role="button" tabindex="0">
        <img src="${h.img}" alt="${h.name}" loading="lazy">
        <div class="cg-hero-body">
          <span class="cg-hero-badge">FEATURED</span>
          <h3>${h.name}</h3>
          <p>いま人気のゲーム。今すぐプレイ。</p>
          <button class="cg-hero-play">▶ プレイ</button>
        </div>
      </div>`;
  }

  // Grid (filtered)
  const list = CG_ACTIVE_TAG==='ALL' ? GAMES : GAMES.filter(g=>g.tag===CG_ACTIVE_TAG);
  document.getElementById('gameGridAll').innerHTML = list.map((g,i)=>cardHtml(g,i)).join('') || '<div class="muted" style="padding:20px">このタグのゲームはまだありません</div>';
  document.getElementById('gameCount').textContent = `全 ${list.length} 件`;
  const stat = document.getElementById('gameStat'); if(stat) stat.textContent = GAMES.length;
}
function filterGamesByTag(tag){
  CG_ACTIVE_TAG = tag;
  renderGames();
}

// ページ切替
function showPage(id){
  document.body.classList.toggle('search-page', id === 'search');
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const el = document.getElementById(id+'-page');
  if(el) el.classList.add('active');
  document.querySelectorAll('.nav-link').forEach(a=>{
    a.classList.toggle('active', a.dataset.page===id);
  });
  document.getElementById('gnav').classList.remove('open');
  window.scrollTo(0,0);
  if(id === 'quake'){ ensureLeaflet().then(() => setTimeout(() => { try{ renderQuakeMap(); }catch(e){} if(typeof renderEarthquakeMonitor === 'function') renderEarthquakeMonitor(); }, 60)); }
  try{
    const tools = document.getElementById('miniTools');
    const host = document.getElementById(id === 'tools' ? 'miniToolsPageSlot' : 'miniToolsHomeSlot');
    if(tools && host && tools.parentElement !== host){ host.appendChild(tools); }
    if(tools) tools.classList.toggle('mini-tools-lg', id === 'tools');
  }catch(e){}
}

// 設定（localStorageに保存）
const SETTINGS_KEY = 'nakayosi_settings_v1';
function loadSettings(){
  try{ return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; }catch(e){ return {}; }
}
function saveSettings(patch){
  const s = Object.assign(loadSettings(), patch);
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}
function toggleTheme(){
  document.body.classList.toggle('dark-mode');
  const nkys = document.getElementById('search-app');
  if(nkys) nkys.setAttribute('data-theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
  saveSettings({ dark: document.body.classList.contains('dark-mode') });
}
function changePrimaryColor(c){
  document.documentElement.style.setProperty('--primary',c);
  saveSettings({ primary: c });
}
function resetPrimaryColor(){
  const c = document.body.classList.contains('dark-mode') ? '#5aa9ff' : '#0b5fa5';
  changePrimaryColor(c);
  document.getElementById('primary-color-picker').value = c;
}
function changeFontSize(s){
  document.body.style.fontSize = s+'px';
  saveSettings({ fontSize: s });
}
function changeFont(f){
  document.body.style.fontFamily = f;
  saveSettings({ font: f });
}
function changeBackgroundPattern(p){
  const b = document.body.style;
  if(p==='none'){ b.backgroundImage='none'; }
  else if(p==='dots'){ b.backgroundImage='radial-gradient(var(--text-muted) 1px,transparent 1px)'; b.backgroundSize='25px 25px'; }
  else { b.backgroundImage='linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(90deg,var(--border) 1px,transparent 1px)'; b.backgroundSize='30px 30px'; }
  saveSettings({ bg: p });
}
function applySavedSettings(){
  const s = loadSettings();
  if(s.dark) document.body.classList.add('dark-mode');
  if(s.primary){
    document.documentElement.style.setProperty('--primary', s.primary);
    const p = document.getElementById('primary-color-picker'); if(p) p.value = s.primary;
  }
  if(s.fontSize){
    document.body.style.fontSize = s.fontSize+'px';
    const r = document.querySelector('input[type=range]'); if(r) r.value = s.fontSize;
  }
  if(s.bg){
    changeBackgroundPattern(s.bg);
    const sel = document.querySelector('#settings-page select:not(#font-select)'); if(sel) sel.value = s.bg;
  }
  if(s.clockFormat){
    CLOCK_FORMAT = s.clockFormat;
    const cf = document.getElementById('clock-format-select'); if(cf) cf.value = s.clockFormat;
    renderClock();
  }
  if(s.font){
    document.body.style.fontFamily = s.font;
    const fs = document.getElementById('font-select'); if(fs) fs.value = s.font;
  }
  // 背景画像
  if(s.bgImage){
    applyBgImage(s.bgImage, s.bgFixed !== false, s.bgOpacity || 100);
    const op = document.getElementById('bg-image-opacity'); if(op) op.value = s.bgOpacity || 100;
    const opv = document.getElementById('bg-image-opacity-val'); if(opv) opv.textContent = (s.bgOpacity || 100)+'%';
    const fx = document.getElementById('bg-image-fixed'); if(fx) fx.checked = s.bgFixed !== false;
    const pv = document.getElementById('bg-image-preview');
    if(pv) pv.innerHTML = `<img src="${s.bgImage}" alt="背景プレビュー" style="max-width:220px;max-height:130px;border-radius:8px;border:1px solid var(--border)">`;
  }
  if(s.disguise){
    const d = document.getElementById('disguise-select'); if(d) d.value = s.disguise;
    applyDisguise(s.disguise);
  }
}


// ================= 偽装モード =================
const DISGUISE_PRESETS = {
  off:        { title: null, favicon: null },
  google:     { title: 'Google',            favicon: 'https://www.google.com/favicon.ico' },
  gtranslate: { title: 'Google 翻訳',        favicon: 'https://translate.google.com/favicon.ico' },
  classroom:  { title: 'ホーム - Classroom', favicon: 'https://ssl.gstatic.com/classroom/favicon.png' }
};
let ORIGINAL_TITLE = document.title;
function setFavicon(href){
  let link = document.querySelector('link[rel="icon"]');
  if(!link){ link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
  if(href){ link.href = href; link.type = ''; }
  else { link.href = '/site-icon.png'; link.type = 'image/png'; }
}
function applyDisguise(mode){
  const p = DISGUISE_PRESETS[mode] || DISGUISE_PRESETS.off;
  if(p.title){ document.title = p.title; setFavicon(p.favicon); }
  else { document.title = ORIGINAL_TITLE; setFavicon(null); }
}
function changeDisguise(mode){
  saveSettings({ disguise: mode });
  applyDisguise(mode);
}

// ================= 背景画像（GIF対応） =================
function applyBgImage(dataUrl, fixed, opacity){
  let layer = document.getElementById('bg-image-layer');
  if(!layer){
    layer = document.createElement('div');
    layer.id = 'bg-image-layer';
    layer.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;background-repeat:no-repeat;background-size:cover;background-position:center;';
    document.body.appendChild(layer);
  }
  layer.style.backgroundImage = `url("${dataUrl}")`;
  layer.style.backgroundAttachment = fixed ? 'fixed' : 'scroll';
  layer.style.opacity = (opacity/100).toFixed(2);
}
function removeBgImageLayer(){
  const layer = document.getElementById('bg-image-layer');
  if(layer) layer.remove();
}
function onBgImageSelected(e){
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  if(file.size > 6 * 1024 * 1024){
    alert('画像が大きすぎます（6MB以下にしてください）');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result;
    const s = loadSettings();
    const fixed = s.bgFixed !== false;
    const opacity = s.bgOpacity || 100;
    try {
      saveSettings({ bgImage: dataUrl, bgFixed: fixed, bgOpacity: opacity });
    } catch(err){
      alert('この画像は保存領域に収まりません。もう少し小さな画像をお試しください。');
      return;
    }
    applyBgImage(dataUrl, fixed, opacity);
    const pv = document.getElementById('bg-image-preview');
    if(pv) pv.innerHTML = `<img src="${dataUrl}" alt="背景プレビュー" style="max-width:220px;max-height:130px;border-radius:8px;border:1px solid var(--border)">`;
  };
  reader.readAsDataURL(file);
}
function clearBgImage(){
  saveSettings({ bgImage: '', bgFixed: true, bgOpacity: 100 });
  removeBgImageLayer();
  const pv = document.getElementById('bg-image-preview'); if(pv) pv.innerHTML = '';
  const fi = document.getElementById('bg-image-input'); if(fi) fi.value = '';
}
function toggleBgFixed(v){
  const s = loadSettings();
  saveSettings({ bgFixed: v });
  if(s.bgImage) applyBgImage(s.bgImage, v, s.bgOpacity || 100);
}
function changeBgOpacity(v){
  const s = loadSettings();
  saveSettings({ bgOpacity: Number(v) });
  const opv = document.getElementById('bg-image-opacity-val'); if(opv) opv.textContent = v+'%';
  if(s.bgImage) applyBgImage(s.bgImage, s.bgFixed !== false, Number(v));
}

// ゲームモーダル
// ===== FPSメーター（実測値：rAFのフレーム間隔を計測）=====
const GM_FPS = { raf:0, last:0, frames:0, acc:0, min:Infinity, worst:0 };
function gmFpsLoop(ts){
  const el = document.getElementById('gmFps');
  if(!el){ GM_FPS.raf = 0; return; }
  if(GM_FPS.last){
    const dt = ts - GM_FPS.last;
    GM_FPS.frames++; GM_FPS.acc += dt;
    if(dt > GM_FPS.worst) GM_FPS.worst = dt;
    if(GM_FPS.acc >= 500){
      const fps = Math.round((GM_FPS.frames * 1000) / GM_FPS.acc);
      const minFps = Math.max(1, Math.round(1000 / GM_FPS.worst));
      if(fps < GM_FPS.min) GM_FPS.min = fps;
      el.textContent = `FPS ${String(fps).padStart(3,' ')}\n${GM_FPS.worst.toFixed(1)}ms / min ${minFps}`;
      el.classList.toggle('warn', fps < 50 && fps >= 30);
      el.classList.toggle('bad', fps < 30);
      GM_FPS.frames = 0; GM_FPS.acc = 0; GM_FPS.worst = 0;
    }
  }
  GM_FPS.last = ts;
  GM_FPS.raf = requestAnimationFrame(gmFpsLoop);
}
function startFps(){
  const el = document.getElementById('gmFps');
  if(el){ el.classList.remove('hidden'); el.textContent = 'FPS --'; }
  GM_FPS.last = 0; GM_FPS.frames = 0; GM_FPS.acc = 0; GM_FPS.worst = 0; GM_FPS.min = Infinity;
  if(!GM_FPS.raf) GM_FPS.raf = requestAnimationFrame(gmFpsLoop);
}
function stopFps(){
  if(GM_FPS.raf) cancelAnimationFrame(GM_FPS.raf);
  GM_FPS.raf = 0;
}
function toggleFps(){
  const el = document.getElementById('gmFps');
  if(el) el.classList.toggle('hidden');
}

function openGame(url, name){
  const modal = document.getElementById('game-modal');
  const frame = document.getElementById('game-frame');
  frame.src = url;
  const t = document.getElementById('gm-title-text');
  if(t) t.textContent = name || 'ゲーム';
  modal.style.display='flex';
  document.body.style.overflow='hidden';
  // 快適プレイ：重い装飾を止めてゲームにリソースを回す
  document.body.classList.add('gaming');
  frame.addEventListener('load', ()=>{ try{ frame.contentWindow.focus(); }catch(_){}} , { once:true });
  setTimeout(()=>{ try{ frame.focus(); }catch(_){} }, 60);
  startFps();
}
function closeGame(){
  document.getElementById('game-modal').style.display='none';
  document.getElementById('game-frame').src='';
  document.body.style.overflow='';
  document.body.classList.remove('gaming');
  stopFps();
}
function reloadGame(){
  const f = document.getElementById('game-frame');
  const src = f.src; f.src=''; setTimeout(()=>{ f.src = src; }, 40);
}
function toggleFullScreen(){
  const shell = document.querySelector('#game-modal .gm-shell') || document.getElementById('game-modal');
  if(!document.fullscreenElement){ shell.requestFullscreen?.(); } else { document.exitFullscreen(); }
  setTimeout(()=>{ try{ document.getElementById('game-frame').focus(); }catch(_){} }, 80);
}
function syncGameBar(){
  const modal = document.getElementById('game-modal');
  if(document.fullscreenElement && modal.contains(document.fullscreenElement)){
    modal.classList.add('fs-active');
  } else {
    modal.classList.remove('fs-active');
  }
}
document.addEventListener('fullscreenchange', syncGameBar);
document.addEventListener('keydown',(e)=>{
  if(e.key.toLowerCase()==='f' && e.shiftKey && document.getElementById('game-modal').style.display==='flex'){ toggleFps(); }
});
document.addEventListener('keydown',(e)=>{
  if(e.key==='Escape' && !document.fullscreenElement && document.getElementById('game-modal').style.display==='flex') closeGame();
});


// ================= 天気（気象庁公式API） =================
// 気象庁 forecast API: https://www.jma.go.jp/bosai/forecast/data/forecast/{officeCode}.json
// 47都道府県 → 気象台コード
const JMA_OFFICES = {
  "北海道":"016000","青森県":"020000","岩手県":"030000","宮城県":"040000","秋田県":"050000",
  "山形県":"060000","福島県":"070000","茨城県":"080000","栃木県":"090000","群馬県":"100000",
  "埼玉県":"110000","千葉県":"120000","東京都":"130000","神奈川県":"140000","新潟県":"150000",
  "富山県":"160000","石川県":"170000","福井県":"180000","山梨県":"190000","長野県":"200000",
  "岐阜県":"210000","静岡県":"220000","愛知県":"230000","三重県":"240000","滋賀県":"250000",
  "京都府":"260000","大阪府":"270000","兵庫県":"280000","奈良県":"290000","和歌山県":"300000",
  "鳥取県":"310000","島根県":"320000","岡山県":"330000","広島県":"340000","山口県":"350000",
  "徳島県":"360000","香川県":"370000","愛媛県":"380000","高知県":"390000","福岡県":"400000",
  "佐賀県":"410000","長崎県":"420000","熊本県":"430000","大分県":"440000","宮崎県":"450000",
  "鹿児島県":"460100","沖縄県":"471000"
};
// 天気コード → 絵文字（主要な気象庁コード）
function wxSvg(paths, extra){
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths+'</svg>';
}
const WX_SVG = {
  sun:  '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.2M12 19.8V22M4.2 12H2M22 12h-2.2M5.1 5.1l1.6 1.6M17.3 17.3l1.6 1.6M18.9 5.1l-1.6 1.6M6.7 17.3l-1.6 1.6"/>',
  cloud:'<path d="M7.2 18.5h9.6a3.8 3.8 0 0 0 .4-7.6 5.6 5.6 0 0 0-10.8-1A3.9 3.9 0 0 0 7.2 18.5z"/>',
  part: '<circle cx="8.4" cy="8" r="3"/><path d="M8.4 2.6v1.6M3 8H1.6M4.6 4.2 3.5 3.1M12.2 4.2l1.1-1.1"/><path d="M9 19.5h8.4a3.5 3.5 0 0 0 .3-7 5.2 5.2 0 0 0-9.9-.9A3.6 3.6 0 0 0 9 19.5z"/>',
  rain: '<path d="M7.4 15.6h9.2a3.6 3.6 0 0 0 .3-7.2 5.4 5.4 0 0 0-10.3-1 3.7 3.7 0 0 0 .8 8.2z"/><path d="M9 18.4 8 21M13 18.4 12 21M17 18.4 16 21"/>',
  snow: '<path d="M7.4 15.6h9.2a3.6 3.6 0 0 0 .3-7.2 5.4 5.4 0 0 0-10.3-1 3.7 3.7 0 0 0 .8 8.2z"/><path d="M9 19h.01M12.5 20.5h.01M16 19h.01M10.5 21.5h.01M14.5 18h.01"/>',
  storm:'<path d="M7.4 14.6h9.2a3.6 3.6 0 0 0 .3-7.2 5.4 5.4 0 0 0-10.3-1 3.7 3.7 0 0 0 .8 8.2z"/><path d="m13 16-3.2 4.4h3.2L11.4 24"/>'
};
function wxIcon(code){
  const c = String(code||'');
  let k = 'part';
  if(/^1|^123|^124|^125|^126|^127|^128/.test(c)) k='sun';
  else if(/^2|^223|^231/.test(c)) k='cloud';
  else if(/^3|^313|^314|^315|^316|^317/.test(c)) k='rain';
  else if(/^4|^40[0-9]|^41[0-4]/.test(c)) k='snow';
  else if(/^5|^6|^7/.test(c)) k='storm';
  return wxSvg(WX_SVG[k]);
}
var WX_PREF = '';
var WX_CITY = '';
var WX_AREAS = []; // 都道府県内エリアリスト
async function fetchWxAreas(pref){
  // 気象庁エリアAPIから該当officeの子エリア取得
  try{
    const office = JMA_OFFICES[pref]; if(!office) return [];
    const res = await fetch('https://www.jma.go.jp/bosai/common/const/area.json');
    const data = await res.json();
    const class10s = data.class10s || {};
    const offices = data.offices || {};
    const targetOffice = offices[office];
    if(!targetOffice) return [];
    // office → class10s の children
    const children = Object.entries(class10s).filter(([code,v]) => v.parent === office);
    return children.map(([code,v]) => ({ code, name: v.name }));
  }catch(e){ return []; }
}
function buildWxPrefOptions(){
  const sel = document.getElementById('wxPref');
  if(!sel || sel.dataset.built) return;
  sel.innerHTML = '<option value="">▼ 都道府県を選択</option>' +
    Object.keys(JMA_OFFICES).map(p => `<option value="${p}">${p}</option>`).join('');
  sel.dataset.built = '1';
  if(WX_PREF) sel.value = WX_PREF;
}
async function onWxPrefChange(v){
  WX_PREF = v; WX_CITY = '';
  saveSettings({ wxPref: v, wxCity: '' });
  const citySel = document.getElementById('wxCity');
  WX_AREAS = v ? await fetchWxAreas(v) : [];
  if(citySel){
    citySel.innerHTML = '<option value="">▼ 地域を選択（代表地点）</option>' +
      WX_AREAS.map(a => `<option value="${a.code}">${a.name}</option>`).join('');
    if(WX_AREAS.length){
      WX_CITY = WX_AREAS[0].code;
      citySel.value = WX_CITY;
      saveSettings({ wxCity: WX_CITY });
      fetchWxTowns(WX_CITY).then(towns => { WX_TOWNS = towns; buildWxTownOptions(towns, ''); });
    }
  }
  fetchWeather(true);
}
async function onWxCityChange(v){
  WX_CITY = v;
  WX_TOWN = '';
  saveSettings({ wxCity: v, wxTown: '' });
  WX_TOWNS = v ? await fetchWxTowns(v) : [];
  buildWxTownOptions(WX_TOWNS, '');
  fetchWeather(true);
}
async function fetchWeather(force){
  const locEl = document.getElementById('wxLoc');
  const todayEl = document.getElementById('wxToday');
  const weekEl = document.getElementById('wxWeek');
  const yahoo = document.getElementById('wxYahooLink');
  if(typeof fetchWxWarnings === 'function') fetchWxWarnings();
  if(!WX_PREF){
    if(locEl) locEl.innerHTML = '地域が未設定です <small>「設定」から都道府県を選んでください</small>';
    if(todayEl) todayEl.innerHTML = '<div class="wx-empty">「設定」ページの「📍天気の地域」で都道府県を選ぶと、ここに天気が表示されます。</div>';
    if(weekEl) weekEl.innerHTML = '';
    if(yahoo) yahoo.href = 'https://weather.yahoo.co.jp/weather/';
    return;
  }
  if(yahoo){
    // Yahoo!天気のトップから該当都道府県ページへ
    yahoo.href = 'https://weather.yahoo.co.jp/weather/search/?p=' + encodeURIComponent(WX_PREF);
  }
  const office = JMA_OFFICES[WX_PREF];
  try{
    const res = await fetch(`https://www.jma.go.jp/bosai/forecast/data/forecast/${office}.json?_=${Date.now()}`, { cache:'no-store' });
    if(!res.ok) throw new Error('API error');
    const data = await res.json();
    // data[0] は短期予報（today/tomorrow）、data[1] は週間
    const short = data[0];
    const weekly = data[1];
    // 選択したエリアを探す。未指定なら先頭。
    const weatherAreas = short.timeSeries[0].areas;
    let idx = 0;
    if(WX_CITY){
      const i = weatherAreas.findIndex(a => a.area.code === WX_CITY);
      if(i >= 0) idx = i;
    }
    const areaName = weatherAreas[idx].area.name;
    const areaCode = weatherAreas[idx].area.code;
    const weathers = weatherAreas[idx].weathers || [];
    const codes = weatherAreas[idx].weatherCodes || [];
    const times = short.timeSeries[0].timeDefines || [];
    // 気温（短期）
    let hi=null, lo=null;
    if(short.timeSeries[2]){
      const tempAreas = short.timeSeries[2].areas;
      const t = tempAreas[0]; // 代表気温観測点
      const temps = t.temps || [];
      lo = temps[0]!=='' ? temps[0] : null;
      hi = temps[1]!=='' ? temps[1] : null;
    }
    if(locEl){
      locEl.innerHTML = `${WX_PREF} <small>${areaName}</small>`;
    }
    // ヘッダーの天気ウィジェット
    const bwx = document.getElementById('brandWx');
    if(bwx){
      const tempStr = (hi!=null) ? `${hi}°` : (lo!=null ? `${lo}°` : '--°');
      bwx.innerHTML = `<span class="wx-i">${wxIcon(codes[0])}</span><span class="wx-t">${tempStr}</span>`;
      bwx.title = `${WX_PREF} ${areaName} / クリックで天気ページ`;
    }
    if(todayEl){
      const today = weathers[0] || '—';
      const todayCode = codes[0];
      // 明日の天気（timeSeries[0]の2件目 = 翌日分。無い/空の場合は週間予報から補完）
      let tmrwText = weathers[1] || '';
      let tmrwCode = codes[1] || '';
      let tmrwDate = times[1] ? new Date(times[1]) : null;
      let tHi = null, tLo = null;
      if(weekly && weekly.timeSeries[0]){
        const wArea0 = weekly.timeSeries[0].areas[0];
        const wTimes0 = weekly.timeSeries[0].timeDefines || [];
        const wTempArea0 = weekly.timeSeries[1] ? weekly.timeSeries[1].areas[0] : null;
        const wMax0 = wTempArea0?.tempsMax || [];
        const wMin0 = wTempArea0?.tempsMin || [];
        const targetDate = (tmrwDate || new Date(Date.now()+86400000)).toDateString();
        let wi = wTimes0.findIndex(t => new Date(t).toDateString() === targetDate);
        if(wi < 0) wi = 0; // 見つからなければ週間予報の先頭（通常は明日）を使う
        if(!tmrwCode && wArea0.weatherCodes) tmrwCode = wArea0.weatherCodes[wi] || '';
        if(wMax0[wi] && wMax0[wi] !== '') tHi = wMax0[wi];
        if(wMin0[wi] && wMin0[wi] !== '') tLo = wMin0[wi];
        if(!tmrwDate && wTimes0[wi]) tmrwDate = new Date(wTimes0[wi]);
      }
      if(!tmrwDate) tmrwDate = new Date(Date.now()+86400000);
      todayEl.innerHTML = `<div class="wx-today">
        <div class="icon">${wxIcon(todayCode)}</div>
        <div class="txt">
          <h3>今日の天気（${new Date(times[0]||Date.now()).toLocaleDateString('ja-JP',{month:'numeric',day:'numeric',weekday:'short'})}）</h3>
          <p>${today.replace(/\u3000/g,' ')}</p>
          <div class="temps">
            ${hi!=null?`<span class="hi">最高 ${hi}℃</span>`:''}
            ${lo!=null?`<span class="lo">最低 ${lo}℃</span>`:''}
          </div>
        </div>
      </div>
      <div class="wx-today wx-tomorrow">
        <div class="icon">${wxIcon(tmrwCode)}</div>
        <div class="txt">
          <h3>明日の天気（${tmrwDate.toLocaleDateString('ja-JP',{month:'numeric',day:'numeric',weekday:'short'})}）</h3>
          <p>${(tmrwText||'—').toString().replace(/\u3000/g,' ')}</p>
          <div class="temps">
            ${tHi!=null?`<span class="hi">最高 ${tHi}℃</span>`:''}
            ${tLo!=null?`<span class="lo">最低 ${tLo}℃</span>`:''}
          </div>
        </div>
      </div>`;
    }
    // 週間予報
    if(weekEl && weekly){
      const wArea = weekly.timeSeries[0].areas[0];
      const wTimes = weekly.timeSeries[0].timeDefines || [];
      const wCodes = wArea.weatherCodes || [];
      const wPops = wArea.pops || [];
      const wTemp = weekly.timeSeries[1] ? weekly.timeSeries[1].areas[0] : null;
      const wMax = wTemp?.tempsMax || [];
      const wMin = wTemp?.tempsMin || [];
      weekEl.innerHTML = wTimes.map((tstr,i)=>{
        const d = new Date(tstr);
        const day = d.toLocaleDateString('ja-JP',{month:'numeric',day:'numeric'});
        const wk = ['日','月','火','水','木','金','土'][d.getDay()];
        return `<div class="wx-day">
          <div class="d">${day} (${wk})</div>
          <div class="i">${wxIcon(wCodes[i])}</div>
          <div class="t">
            ${wMax[i]?`<span class="hi">${wMax[i]}°</span>`:''}
            ${wMin[i]?`<span class="lo">${wMin[i]}°</span>`:''}
          </div>
          ${wPops[i]?`<div class="p">☂ ${wPops[i]}%</div>`:''}
        </div>`;
      }).join('');
    }
  }catch(e){
    if(todayEl) todayEl.innerHTML = '<div class="wx-empty">天気情報を取得できませんでした。時間をおいて再度お試しください。</div>';
    if(weekEl) weekEl.innerHTML = '';
  }
}

// 設定ロード時に天気設定も適用
const _origApplySavedSettings = applySavedSettings;
applySavedSettings = function(){
  _origApplySavedSettings();
  const s = loadSettings();
  buildWxPrefOptions();
  if(s.wxPref){
    WX_PREF = s.wxPref;
    const p = document.getElementById('wxPref'); if(p) p.value = s.wxPref;
    fetchWxAreas(s.wxPref).then(areas => {
      WX_AREAS = areas;
      const c = document.getElementById('wxCity');
      if(c){
        c.innerHTML = '<option value="">▼ 地域を選択（代表地点）</option>' +
          areas.map(a => `<option value="${a.code}">${a.name}</option>`).join('');
        if(s.wxCity){ WX_CITY = s.wxCity; c.value = s.wxCity; }
      }
      if(s.wxCity){
        fetchWxTowns(s.wxCity).then(towns => {
          WX_TOWNS = towns;
          if(s.wxTown) WX_TOWN = s.wxTown;
          buildWxTownOptions(towns, s.wxTown || '');
          fetchWeather();
        });
      }
      fetchWeather();
    });
  }
};

// ================= 気象警報（大雨警報 Lv.1-5） =================
var WX_TOWN = '';
var WX_TOWNS = [];
var WX_AREA_DATA = null;

async function loadJmaAreaData(){
  if(WX_AREA_DATA) return WX_AREA_DATA;
  try{
    const res = await fetch('https://www.jma.go.jp/bosai/common/const/area.json');
    WX_AREA_DATA = await res.json();
  }catch(e){ WX_AREA_DATA = null; }
  return WX_AREA_DATA;
}

// class10（地域）配下の市区町村（class20）一覧
async function fetchWxTowns(class10){
  const data = await loadJmaAreaData();
  if(!data || !class10) return [];
  const class15s = data.class15s || {};
  const class20s = data.class20s || {};
  const mid = Object.keys(class15s).filter(c => class15s[c].parent === class10);
  const towns = [];
  Object.keys(class20s).forEach(code => {
    if(mid.includes(class20s[code].parent)) towns.push({ code, name: class20s[code].name });
  });
  return towns;
}

function buildWxTownOptions(towns, selected){
  const sel = document.getElementById('wxTown');
  if(!sel) return;
  sel.innerHTML = '<option value="">▼ 市区町村を選択</option>' +
    towns.map(t => `<option value="${t.code}">${t.name}</option>`).join('');
  if(selected) sel.value = selected;
}

async function onWxTownChange(v){
  WX_TOWN = v;
  saveSettings({ wxTown: v });
  fetchWeather(true);
}

// 気象庁の警報コード
const JMA_WARN_NAMES = {
  '02':'暴風雪警報','03':'大雨警報','04':'洪水警報','05':'暴風警報','06':'大雪警報','07':'波浪警報','08':'高潮警報',
  '10':'大雨注意報','12':'大雪注意報','13':'風雪注意報','14':'雷注意報','15':'強風注意報','16':'波浪注意報','17':'融雪注意報',
  '18':'洪水注意報','19':'高潮注意報','20':'濃霧注意報','21':'乾燥注意報','22':'なだれ注意報','23':'低温注意報',
  '24':'霜注意報','25':'着氷注意報','26':'着雪注意報','27':'その他警報等','32':'暴風雪特別警報','33':'大雨特別警報',
  '35':'暴風特別警報','36':'大雪特別警報','37':'波浪特別警報','38':'高潮特別警報'
};
const WX_LEVEL_TEXT = {
  1:{ t:'平常', d:'大雨に関する警報・注意報は発表されていません。最新情報の確認を心がけましょう。' },
  2:{ t:'注意報', d:'大雨注意報が発表されています。ハザードマップで避難経路を確認してください。' },
  3:{ t:'警報', d:'大雨警報が発表されています。高齢者等は避難を開始してください（警戒レベル3相当）。' },
  4:{ t:'危険', d:'土砂災害警戒情報・記録的短時間大雨など、災害発生のおそれが非常に高い状況です。危険な場所から全員避難してください（警戒レベル4相当）。' },
  5:{ t:'特別警報', d:'大雨特別警報が発表されています。命の危険がある状況です。直ちに命を守る行動をとってください（警戒レベル5相当）。' }
};

function wxRainLevelFromWarnings(warnings){
  let lv = 1;
  (warnings||[]).forEach(w => {
    if(w.status === '解除' || w.status === '発表警報・注意報はなし') return;
    const c = String(w.code||'');
    const cond = String(w.condition||'');
    if(c === '33') lv = Math.max(lv, 5);
    else if(c === '03'){
      lv = Math.max(lv, (/土砂|浸水/.test(cond) && /土砂/.test(cond)) ? 4 : 3);
    }
    else if(c === '04') lv = Math.max(lv, 3);
    else if(c === '10' || c === '18') lv = Math.max(lv, 2);
  });
  return lv;
}

function wxChipClass(code){
  if(['32','33','35','36','37','38'].includes(code)) return 'emg';
  if(['02','03','04','05','06','07','08'].includes(code)) return 'warn';
  return 'note';
}

async function fetchWxWarnings(){
  const el = document.getElementById('wxAlert');
  if(!el) return;
  const office = JMA_OFFICES[WX_PREF];
  if(!office){ el.innerHTML = ''; return; }
  try{
    const res = await fetch(`https://www.jma.go.jp/bosai/warning/data/warning/${office}.json?_=${Date.now()}`, { cache:'no-store' });
    if(!res.ok) throw new Error('warning api');
    const data = await res.json();
    const areaTypes = data.areaTypes || [];
    let target = null, matchedName = '';
    const wanted = [WX_TOWN, WX_CITY].filter(Boolean);
    for(const at of areaTypes){
      for(const a of (at.areas||[])){
        if(wanted.includes(String(a.code))){ target = a; break; }
      }
      if(target) break;
    }
    // 見つからない場合は都道府県内のすべてを集約（最も高いレベルを採用）
    let allWarnings = [];
    if(target){
      allWarnings = target.warnings || [];
      const ad = await loadJmaAreaData();
      const dict = ad ? Object.assign({}, ad.class20s||{}, ad.class15s||{}, ad.class10s||{}) : {};
      matchedName = dict[String(target.code)] ? dict[String(target.code)].name : '選択地域';
    }else{
      (areaTypes[0]?.areas||[]).forEach(a => { allWarnings = allWarnings.concat(a.warnings||[]); });
      matchedName = WX_PREF + '全域';
    }
    const active = allWarnings.filter(w => w.status !== '解除' && w.status !== '発表警報・注意報はなし' && JMA_WARN_NAMES[String(w.code)]);
    const lv = wxRainLevelFromWarnings(allWarnings);
    const info = WX_LEVEL_TEXT[lv];
    const uniq = [];
    active.forEach(w => { const n = JMA_WARN_NAMES[String(w.code)]; if(n && !uniq.some(u=>u.n===n)) uniq.push({n, c:String(w.code)}); });
    el.innerHTML = `<div class="wx-alert lv${lv}">
      <div class="lv"><small>大雨警報</small><b>Lv.${lv}</b><small>${info.t}</small></div>
      <div class="txt">
        <h3>${matchedName} の気象警報</h3>
        <p>${info.d}</p>
        <div class="wx-chips">${uniq.length ? uniq.map(u=>`<span class="wx-chip ${wxChipClass(u.c)}">${u.n}</span>`).join('') : '<span class="wx-chip">発表中の警報・注意報なし</span>'}</div>
      </div>
    </div>`;
  }catch(e){
    el.innerHTML = '<div class="wx-alert lv1"><div class="lv"><small>大雨警報</small><b>Lv.—</b><small>取得失敗</small></div><div class="txt"><h3>気象警報</h3><p>警報情報を取得できませんでした。時間をおいて再度お試しください。</p></div></div>';
  }
}

// ================= 位置情報の許可 =================
const GEO_PREF_COORDS_FALLBACK = {};
function geoNearestPref(lat, lon){
  const table = (typeof WX_PREF_COORDS !== 'undefined' && WX_PREF_COORDS) ? WX_PREF_COORDS
              : (typeof PREF_COORDS !== 'undefined' ? PREF_COORDS : GEO_PREF_COORDS_FALLBACK);
  let best = null, bestD = Infinity;
  Object.keys(table).forEach(p => {
    const c = table[p];
    const d = Math.pow(c[0]-lat,2) + Math.pow((c[1]-lon)*0.82,2);
    if(d < bestD){ bestD = d; best = p; }
  });
  return best;
}
function geoSetStatus(msg){
  const el = document.getElementById('geoStatus');
  if(el) el.textContent = msg || '';
}
function requestGeoLocation(manual){
  if(!navigator.geolocation){ geoSetStatus('この端末では位置情報を利用できません'); return; }
  geoSetStatus('現在地を取得中…');
  navigator.geolocation.getCurrentPosition(async pos => {
    const pref = geoNearestPref(pos.coords.latitude, pos.coords.longitude);
    saveSettings({ geoPermission: 'granted' });
    if(pref){
      const sel = document.getElementById('wxPref');
      if(sel){ buildWxPrefOptions(); sel.value = pref; }
      await onWxPrefChange(pref);
      geoSetStatus('現在地から「' + pref + '」を設定しました');
    }else{
      geoSetStatus('地域を判定できませんでした');
    }
  }, err => {
    saveSettings({ geoPermission: 'denied' });
    geoSetStatus(manual ? '位置情報が許可されませんでした' : '');
  }, { enableHighAccuracy:false, timeout:10000, maximumAge:600000 });
}
function geoAllow(){
  document.getElementById('geoOverlay')?.classList.remove('show');
  saveSettings({ geoAsked: true });
  requestGeoLocation(false);
}
function geoDeny(){
  document.getElementById('geoOverlay')?.classList.remove('show');
  saveSettings({ geoAsked: true, geoPermission: 'denied' });
}
function maybeAskGeoPermission(){
  const s = loadSettings();
  if(s.geoAsked){
    if(s.geoPermission === 'granted' && !s.wxPref) requestGeoLocation(false);
    return;
  }
  setTimeout(() => document.getElementById('geoOverlay')?.classList.add('show'), 600);
}

// ================= 天気マップ（雨雲レーダー） =================
const PREF_COORDS = {
  '北海道':[43.06,141.35,7],'青森県':[40.82,140.74,8],'岩手県':[39.70,141.15,8],'宮城県':[38.27,140.87,8],
  '秋田県':[39.72,140.10,8],'山形県':[38.24,140.36,8],'福島県':[37.75,140.47,8],'茨城県':[36.34,140.45,8],
  '栃木県':[36.57,139.88,8],'群馬県':[36.39,139.06,8],'埼玉県':[35.86,139.65,9],'千葉県':[35.60,140.12,8],
  '東京都':[35.69,139.69,10],'神奈川県':[35.45,139.64,9],'新潟県':[37.90,139.02,8],'富山県':[36.70,137.21,9],
  '石川県':[36.59,136.63,9],'福井県':[36.07,136.22,9],'山梨県':[35.66,138.57,9],'長野県':[36.65,138.18,8],
  '岐阜県':[35.39,136.72,8],'静岡県':[34.98,138.38,8],'愛知県':[35.18,136.91,9],'三重県':[34.73,136.51,8],
  '滋賀県':[35.00,135.87,9],'京都府':[35.02,135.76,9],'大阪府':[34.69,135.52,10],'兵庫県':[34.69,135.18,8],
  '奈良県':[34.69,135.83,9],'和歌山県':[34.23,135.17,9],'鳥取県':[35.50,134.24,9],'島根県':[35.47,133.05,8],
  '岡山県':[34.66,133.93,9],'広島県':[34.40,132.46,8],'山口県':[34.19,131.47,8],'徳島県':[34.07,134.56,9],
  '香川県':[34.34,134.04,9],'愛媛県':[33.84,132.77,8],'高知県':[33.56,133.53,8],'福岡県':[33.61,130.42,9],
  '佐賀県':[33.25,130.30,9],'長崎県':[32.75,129.88,8],'熊本県':[32.79,130.74,8],'大分県':[33.24,131.61,8],
  '宮崎県':[31.91,131.42,8],'鹿児島県':[31.56,130.56,7],'沖縄県':[26.21,127.68,8]
};
const WX_PREF_COORDS = {
  '北海道':[43.06,141.35,6],'青森県':[40.82,140.74,8],'岩手県':[39.70,141.15,8],'宮城県':[38.27,140.87,8],
  '秋田県':[39.72,140.10,8],'山形県':[38.25,140.34,8],'福島県':[37.76,140.47,8],'茨城県':[36.34,140.45,8],
  '栃木県':[36.57,139.88,8],'群馬県':[36.39,139.06,8],'埼玉県':[35.86,139.65,8],'千葉県':[35.61,140.12,8],
  '東京都':[35.68,139.76,8],'神奈川県':[35.45,139.64,8],'新潟県':[37.90,139.02,8],'富山県':[36.70,137.21,8],
  '石川県':[36.59,136.63,8],'福井県':[36.07,136.22,8],'山梨県':[35.66,138.57,8],'長野県':[36.65,138.18,8],
  '岐阜県':[35.39,136.72,8],'静岡県':[34.98,138.38,8],'愛知県':[35.18,136.91,8],'三重県':[34.73,136.51,8],
  '滋賀県':[35.00,135.87,8],'京都府':[35.02,135.76,8],'大阪府':[34.69,135.52,8],'兵庫県':[34.69,135.18,8],
  '奈良県':[34.69,135.83,8],'和歌山県':[34.23,135.17,8],'鳥取県':[35.50,134.24,8],'島根県':[35.47,133.05,8],
  '岡山県':[34.66,133.93,8],'広島県':[34.40,132.46,8],'山口県':[34.19,131.47,8],'徳島県':[34.07,134.56,8],
  '香川県':[34.34,134.04,8],'愛媛県':[33.84,132.77,8],'高知県':[33.56,133.53,8],'福岡県':[33.61,130.42,8],
  '佐賀県':[33.25,130.30,8],'長崎県':[32.75,129.88,8],'熊本県':[32.79,130.74,8],'大分県':[33.24,131.61,8],
  '宮崎県':[31.91,131.42,8],'鹿児島県':[31.56,130.56,8],'沖縄県':[26.21,127.68,7]
};
let WX_MAP=null, WX_MARKER=null, WX_RAIN=null, WX_RAIN_TIMES=[], WX_RAIN_IDX=0;
let WX_TEMP_LAYER=null, WX_RAIN_LAYER=null, WX_LAYER_CONTROL=null, WX_BASE_LAYER=null;
let WX_LIVE_WEATHER={temperature:null,apparent:null,rain:null,precipitation:null,wind:null,updatedAt:null};

function wxMapPopupHtml(selected){
  const w = WX_LIVE_WEATHER;
  const temp = w.temperature == null ? '—' : `${w.temperature}℃`;
  const apparent = w.apparent == null ? '—' : `${w.apparent}℃`;
  const rain = w.precipitation == null ? '—' : `${w.precipitation} mm`;
  const wind = w.wind == null ? '—' : `${w.wind} km/h`;
  return `<strong>${selected}</strong><div class="wx-popup-grid"><span>気温</span><b>${temp}</b><span>体感</span><b>${apparent}</b><span>降水量</span><b>${rain}</b><span>風速</span><b>${wind}</b></div>`;
}

function updateWxTemperatureLayer(coords, selected){
  if(!WX_MAP || typeof L === 'undefined') return;
  if(!WX_TEMP_LAYER) WX_TEMP_LAYER = L.layerGroup().addTo(WX_MAP);
  WX_TEMP_LAYER.clearLayers();
  const temp = WX_LIVE_WEATHER.temperature;
  const tempText = temp == null ? '—' : `${temp}℃`;
  const icon = L.divIcon({className:'wx-temp-label', html:`<div><span class="wx-temp-symbol">🌡️</span><b>${tempText}</b><small>${selected} 現在気温</small></div>`, iconSize:[100,54], iconAnchor:[50,58]});
  L.marker(coords.slice(0,2), {icon, interactive:false, keyboard:false}).addTo(WX_TEMP_LAYER);
}

async function fetchWxLiveWeather(coords, selected){
  try{
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords[0]}&longitude=${coords[1]}&current=temperature_2m,apparent_temperature,precipitation,rain,wind_speed_10m&timezone=auto`;
    const res = await fetch(url, {cache:'no-store'});
    if(!res.ok) throw new Error('weather map api error');
    const data = await res.json();
    const c = data.current || {};
    WX_LIVE_WEATHER = {
      temperature: c.temperature_2m,
      apparent: c.apparent_temperature,
      rain: c.rain,
      precipitation: c.precipitation,
      wind: c.wind_speed_10m,
      updatedAt: c.time || new Date().toISOString()
    };
    updateWxTemperatureLayer(coords, selected);
    if(WX_MARKER) WX_MARKER.setPopupContent(wxMapPopupHtml(selected));
    const note = document.getElementById('wxMapNote');
    if(note) note.textContent = `${selected}周辺 · 気温 ${WX_LIVE_WEATHER.temperature ?? '—'}℃ · 降水量 ${WX_LIVE_WEATHER.precipitation ?? '—'} mm`;
    const status = document.getElementById('wxMapStatus');
    if(status) status.textContent = '気温・降水情報を更新済み';
  }catch(e){
    updateWxTemperatureLayer(coords, selected);
    const status = document.getElementById('wxMapStatus');
    if(status) status.textContent = '地図接続済み（気象情報は未取得）';
  }
}

async function fetchWxRainLayer(){
  if(!WX_MAP || typeof L === 'undefined') return;
  try{
    const res = await fetch('https://api.rainviewer.com/public/weather-maps.json', {cache:'no-store'});
    if(!res.ok) throw new Error('rain radar api error');
    const data = await res.json();
    const frames = data.radar?.past || [];
    const frame = frames[frames.length - 1];
    if(!frame) throw new Error('no radar frame');
    if(WX_RAIN_LAYER) WX_RAIN_LAYER.clearLayers();
    if(!WX_RAIN_LAYER) WX_RAIN_LAYER = L.layerGroup().addTo(WX_MAP);
    const host = data.host || 'https://tilecache.rainviewer.com';
    const tileUrl = `${host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
    L.tileLayer(tileUrl, {opacity:.62, tileSize:256, maxNativeZoom:7, maxZoom:18, attribution:'RainViewer'}).addTo(WX_RAIN_LAYER);
    const status = document.getElementById('wxMapStatus');
    if(status) status.textContent = '気温・降水レーダーを更新済み';
  }catch(e){
    const status = document.getElementById('wxMapStatus');
    if(status) status.textContent = '気温表示済み（降水レーダー未接続）';
  }
}

async function initWxMap(){
  const el = document.getElementById('wxMap');
  if(!el || typeof L === 'undefined') return;
  const selected = WX_PREF || '東京都';
  const coords = WX_PREF_COORDS[selected] || WX_PREF_COORDS['東京都'];
  if(!WX_MAP){
    WX_BASE_LAYER = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:18, attribution:'&copy; OpenStreetMap contributors'});
    WX_MAP = L.map(el, {scrollWheelZoom:false, zoomControl:true, attributionControl:true, layers:[WX_BASE_LAYER]}).setView(coords.slice(0,2), coords[2] || 7);
    WX_TEMP_LAYER = L.layerGroup().addTo(WX_MAP);
    WX_RAIN_LAYER = L.layerGroup().addTo(WX_MAP);
    WX_LAYER_CONTROL = L.control.layers({'標準地図':WX_BASE_LAYER}, {'現在の気温':WX_TEMP_LAYER, '降水レーダー':WX_RAIN_LAYER}, {collapsed:false, position:'topright'}).addTo(WX_MAP);
    WX_MAP.on('zoomend moveend', () => {
      const note = document.getElementById('wxMapNote');
      if(note) note.textContent = `${selected}周辺の気象マップ · ズーム ${WX_MAP.getZoom()}`;
    });
  }else{
    WX_MAP.setView(coords.slice(0,2), coords[2] || 7);
  }
  if(WX_MARKER) WX_MAP.removeLayer(WX_MARKER);
  const icon = L.divIcon({className:'wx-map-pin', html:'<span></span>', iconSize:[24,24], iconAnchor:[12,12]});
  WX_MARKER = L.marker(coords.slice(0,2), {icon, title:selected}).addTo(WX_MAP).bindPopup(wxMapPopupHtml(selected));
  updateWxTemperatureLayer(coords, selected);
  fetchWxLiveWeather(coords, selected);
  fetchWxRainLayer();
  const note = document.getElementById('wxMapNote');
  if(note) note.textContent = `${selected}周辺の気象マップ · 気温と降水レーダーを表示中`;
  const status = document.getElementById('wxMapStatus');
  if(status) status.textContent = '地図・気象情報を接続中';
  setTimeout(() => WX_MAP.invalidateSize(), 80);
}
function onWxPrefMapClick(pref){
  const select = document.getElementById('wxPref');
  if(select){ select.value = pref; onWxPrefChange(pref); }
  else { WX_PREF = pref; fetchWeather(true); }
  setTimeout(() => ensureLeaflet().then(initWxMap), 80);
}
const _origShowPage = showPage;
showPage = function(id){
  _origShowPage(id);
  if(id === 'weather'){ buildWxPrefOptions(); fetchWeather(); fetchWxWarnings(); setTimeout(() => ensureLeaflet().then(initWxMap), 100); }
};

// 初期化
renderNews();
renderNotif();
renderLinks();
renderGames();
renderTicker();
showPage('home');
applySavedSettings();
fetchQuakes();
maybeAskGeoPermission();
// 定期更新（地震は速報性重視で頻度高め）
setInterval(() => { if(!document.hidden) fetchQuakes(); }, 60*1000);
setInterval(() => { if(WX_PREF && !document.hidden) fetchWeather(); }, 5*60*1000);
setInterval(() => { if(WX_PREF && !document.hidden) fetchWxWarnings(); }, 3*60*1000);

// タブ復帰／オンライン復帰で即時更新
function refreshAllLive(){
  fetchQuakes();
  if(WX_PREF){ fetchWeather(); fetchWxWarnings(); }
}
document.addEventListener('visibilitychange', ()=>{
  if(document.hidden) return;
  const now = Date.now();
  if(now - (window.__lastLiveRefresh||0) < 30*1000) return;
  window.__lastLiveRefresh = now;
  refreshAllLive();
});
window.addEventListener('online', refreshAllLive);

// 地震はWebSocketでプッシュ受信（完全リアルタイム）
(function connectQuakeWS(){
  let ws, retry = 0;
  function open(){
    try{ ws = new WebSocket('wss://api.p2pquake.net/v2/ws'); }catch(e){ return schedule(); }
    ws.onopen = ()=>{ retry = 0; };
    ws.onmessage = (ev)=>{
      try{
        const d = JSON.parse(ev.data);
        if(d && (d.code === 551 || d.code === 552 || d.code === 556)) fetchQuakes(true);
      }catch(_){}
    };
    ws.onclose = schedule;
    ws.onerror = ()=>{ try{ ws.close(); }catch(_){} };
  }
  function schedule(){ retry = Math.min(retry + 1, 6); setTimeout(open, 1000 * Math.pow(2, retry)); }
  open();
})();

;

const CHAT_URL='https://zoomies-connect.lovable.app/room/nakayosi-instace-2-mc';
function openChatModal(){
  const m=document.getElementById('chat-modal');
  const f=document.getElementById('chat-iframe');
  const l=document.getElementById('chat-loading');
  if(f.src!==CHAT_URL){ l.classList.remove('hidden'); f.src=CHAT_URL; }
  m.style.display='flex';
  document.body.style.overflow='hidden';
}
function closeChatModal(){
  document.getElementById('chat-modal').style.display='none';
  document.body.style.overflow='';
}
function reloadChat(){
  const f=document.getElementById('chat-iframe');
  const l=document.getElementById('chat-loading');
  l.classList.remove('hidden');
  f.src=CHAT_URL+'?t='+Date.now();
}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeChatModal();});

;

(function(){
    const tvData = {"na/bloomberg":{"name":"Bloomberg","genre":"full","hlsUrl":"https://channel-surfer.lovable.app/bloomberg.m3u8","fallbackVideoId":"f39oHo6vFLg"},"na/cnbc":{"name":"CNBC","genre":"full","hlsUrl":"","fallbackVideoId":"9NyxcX3rhQs"},"na/cnn":{"name":"CNN","genre":"full","hlsUrl":"https://turnerlive.warnermediacdn.com/hls/live/586495/cnngo/cnn_slate/VIDEO_0_3564000.m3u8","fallbackVideoId":"w_Ma8oQLmSM"},"na/yahoo":{"name":"Yahoo Finance","genre":"tech","hlsUrl":"","fallbackVideoId":"KQp-e_XQnDE"},"na/nasa":{"name":"Sen Space Live","genre":"tech","hlsUrl":"","fallbackVideoId":"fO9e9jnhYK8"},"na/fox-news":{"name":"Fox News","genre":"optional","hlsUrl":"https://247preview.foxnews.com/hls/live/2020027/fncv3preview/primary.m3u8","fallbackVideoId":"QaftgYkG-ek"},"na/newsmax":{"name":"Newsmax","genre":"optional","hlsUrl":"","fallbackVideoId":"oJvKPXZILT0"},"na/abc-news":{"name":"ABC News","genre":"optional","hlsUrl":"","fallbackVideoId":"iipR5yUp36o"},"na/cbs-news":{"name":"CBS News","genre":"optional","hlsUrl":"https://cbsn-us.cbsnstream.cbsnews.com/out/v1/55a8648e8f134e82a470f83d562deeca/master.m3u8","fallbackVideoId":"R9L8sDK8iEc"},"na/nbc-news":{"name":"NBC News","genre":"optional","hlsUrl":"https://dai2.xumo.com/amagi_hls_data_xumo1212A-xumo-nbcnewsnow/CDN/master.m3u8","fallbackVideoId":"yMr0neQhu6c"},"na/cbc-news":{"name":"CBC News","genre":"optional","hlsUrl":"","fallbackVideoId":"5vfaDsMhCF4"},"na/ctv-news":{"name":"CTV News","genre":"optional","hlsUrl":"https://pe-fa-lp02a.9c9media.com/live/News1Digi/p/hls/00000201/38ef78f479b07aa0/index/0c6a10a2/live/stream/h264/v1/3500000/manifest.m3u8","fallbackVideoId":""},"na/reuters-tv":{"name":"Reuters TV","genre":"optional","hlsUrl":"https://reuters-reutersnow-1-eu.rakuten.wurl.tv/playlist.m3u8","fallbackVideoId":""},"eu/sky":{"name":"SkyNews","genre":"full","hlsUrl":"https://linear901-oo-hls0-prd-gtm.delivery.skycdp.com/17501/sde-fast-skynews/master.m3u8","fallbackVideoId":"uvviIF4725I"},"eu/euronews":{"name":"Euronews","genre":"full","hlsUrl":"https://dash4.antik.sk/live/test_euronews/playlist.m3u8","fallbackVideoId":"pykpO5kQJ98"},"eu/dw":{"name":"DW","genre":"full","hlsUrl":"https://dwamdstream103.akamaized.net/hls/live/2015526/dwstream103/master.m3u8","fallbackVideoId":"LuKwFajn37U"},"eu/france24":{"name":"France 24","genre":"full","hlsUrl":"https://amg00106-france24-france24-samsunguk-qvpp8.amagi.tv/playlist/amg00106-france24-france24-samsunguk/playlist.m3u8","fallbackVideoId":"u9foWyMSETk"},"eu/bbc-news":{"name":"BBC News","genre":"optional","hlsUrl":"https://vs-hls-push-uk.live.fastly.md.bbci.co.uk/x=4/i=urn:bbc:pips:service:bbc_news_channel_hd/iptv_hd_abr_v1.m3u8","fallbackVideoId":"bjgQzJzCZKs"},"eu/gb-news":{"name":"GB News","genre":"optional","hlsUrl":"https://live-gbnews.simplestreamcdn.com/live5/gbnews/bitrate1.isml/manifest.m3u8","fallbackVideoId":""},"eu/the-guardian":{"name":"The Guardian","genre":"optional","hlsUrl":"https://rakuten-guardian-1-ie.samsung.wurl.tv/playlist.m3u8","fallbackVideoId":""},"eu/france24-en":{"name":"France 24 English","genre":"optional","hlsUrl":"","fallbackVideoId":"Ap-UM1O9RBU"},"eu/rtve":{"name":"RTVE 24H","genre":"optional","hlsUrl":"","fallbackVideoId":"7_srED6k0bE"},"eu/phoenix":{"name":"Phoenix","genre":"optional","hlsUrl":"https://zdf-hls-19.akamaized.net/hls/live/2016502/de/veryhigh/master.m3u8","fallbackVideoId":""},"eu/rtp3":{"name":"RTP3","genre":"optional","hlsUrl":"https://streaming-live.rtp.pt/livetvhlsDVR/rtpnHDdvr.smil/playlist.m3u8?DVR=","fallbackVideoId":""},"eu/trt-haber":{"name":"TRT Haber","genre":"optional","hlsUrl":"","fallbackVideoId":"3XHebGJG0bc"},"eu/ntv-turkey":{"name":"NTV","genre":"optional","hlsUrl":"","fallbackVideoId":"pqq5c6k70kk"},"eu/cnn-turk":{"name":"CNN TURK","genre":"optional","hlsUrl":"","fallbackVideoId":"lsY4GFoj_xY"},"eu/rt":{"name":"RT","genre":"optional","hlsUrl":"https://rt-glb.rttv.com/dvr/rtnews/playlist.m3u8","fallbackVideoId":""},"eu/tvp-info":{"name":"TVP Info","genre":"optional","hlsUrl":"","fallbackVideoId":"3jKb-uThfrg"},"eu/telewizja-republika":{"name":"Telewizja Republika","genre":"optional","hlsUrl":"","fallbackVideoId":"dzntyCTgJMQ"},"eu/welt":{"name":"WELT","genre":"optional","hlsUrl":"","fallbackVideoId":"L-TNmYmaAKQ"},"eu/tagesschau24":{"name":"Tagesschau24","genre":"optional","hlsUrl":"https://tagesschau.akamaized.net/hls/live/2020115/tagesschau/tagesschau_1/master.m3u8","fallbackVideoId":"fC_q9TkO1uU"},"eu/euronews-fr":{"name":"Euronews FR","genre":"optional","hlsUrl":"","fallbackVideoId":"NiRIbKwAejk"},"eu/ert-news":{"name":"ERT News","genre":"optional","hlsUrl":"https://ertflix.ascdn.broadpeak.io/ertlive/ertnews/default/index.m3u8","fallbackVideoId":""},"eu/france24-fr":{"name":"France 24 FR","genre":"optional","hlsUrl":"","fallbackVideoId":"l8PMl7tUDIE"},"eu/france-info":{"name":"France Info","genre":"optional","hlsUrl":"","fallbackVideoId":"Z-Nwo-ypKtM"},"eu/bfmtv":{"name":"BFMTV","genre":"optional","hlsUrl":"","fallbackVideoId":"smB_F6DW7cI"},"eu/tv5monde-info":{"name":"TV5 Monde Info","genre":"optional","hlsUrl":"https://ott.tv5monde.com/Content/HLS/Live/channel(info)/index.m3u8","fallbackVideoId":""},"eu/nrk1":{"name":"NRK1","genre":"optional","hlsUrl":"https://nrk-nrk1.akamaized.net/21/0/hls/nrk_1/playlist.m3u8","fallbackVideoId":""},"eu/aljazeera-balkans":{"name":"Al Jazeera Balkans","genre":"optional","hlsUrl":"https://live-hls-web-ajb.getaj.net/AJB/index.m3u8","fallbackVideoId":""},"latam/cnn-brasil":{"name":"CNN Brasil","genre":"optional","hlsUrl":"","fallbackVideoId":"qcTn899skkc"},"latam/record-news":{"name":"Record News","genre":"optional","hlsUrl":"https://stream.ads.ottera.tv/playlist.m3u8?network_id=2116","fallbackVideoId":""},"latam/tn-argentina":{"name":"TN (Todo Noticias)","genre":"optional","hlsUrl":"","fallbackVideoId":"cb12KmMMDJA"},"latam/c5n":{"name":"C5N","genre":"optional","hlsUrl":"","fallbackVideoId":"SF06Qy1Ct6Y"},"latam/dw-espanol":{"name":"DW Español","genre":"optional","hlsUrl":"https://dwamdstream104.akamaized.net/hls/live/2015530/dwstream104/stream04/streamPlaylist.m3u8","fallbackVideoId":""},"latam/rt-espanol":{"name":"RT Español","genre":"optional","hlsUrl":"https://rt-esp.rttv.com/dvr/rtesp/playlist.m3u8","fallbackVideoId":""},"latam/cgtn-espanol":{"name":"CGTN Español","genre":"optional","hlsUrl":"https://news.cgtn.com/resource/live/espanol/cgtn-e.m3u8","fallbackVideoId":""},"asia/tbs-news":{"name":"TBS NEWS DIG","genre":"optional","hlsUrl":"https://dp57jmgi8kb6i.cloudfront.net/out/v1/197c216d82a449f89c55f451d995daed/index_7.m3u8","fallbackVideoId":"Anr15FA9OCI"},"asia/ann-news":{"name":"ANN News","genre":"optional","hlsUrl":"","fallbackVideoId":"coYw-eVU0Ks"},"asia/ntv-news":{"name":"NTV News (Japan)","genre":"optional","hlsUrl":"https://dpg5xwfcfl8qq.cloudfront.net/out/v1/d5e0a776979146a0a300aa8b251c62db/index_7.m3u8","fallbackVideoId":"t9kwjZBLI-A"},"asia/cti-news":{"name":"CTI News (Taiwan)","genre":"optional","hlsUrl":"","fallbackVideoId":"vr3XyVCR4T0"},"asia/wion":{"name":"WION","genre":"optional","hlsUrl":"","fallbackVideoId":"vfszY1JYbMc"},"asia/ndtv":{"name":"NDTV 24x7","genre":"optional","hlsUrl":"https://ndtvindiaelemarchana.akamaized.net/hls/live/2003679/ndtvindia/master.m3u8","fallbackVideoId":""},"asia/cgtn":{"name":"CGTN","genre":"optional","hlsUrl":"https://news.cgtn.com/resource/live/english/cgtn-news.m3u8","fallbackVideoId":""},"asia/cna-asia":{"name":"CNA (NewsAsia)","genre":"optional","hlsUrl":"","fallbackVideoId":"XWq5kBlakcQ"},"asia/nhk-world":{"name":"NHK World Japan","genre":"optional","hlsUrl":"https://media-tyo.hls.nhkworld.jp/hls/w/live/master.m3u8","fallbackVideoId":"f0lYkdA-Gtw"},"asia/arirang-news":{"name":"Arirang News","genre":"optional","hlsUrl":"https://amdlive-ch01-ctnd-com.akamaized.net/arirang_1ch/smil:arirang_1ch.smil/playlist.m3u8","fallbackVideoId":""},"asia/india-today":{"name":"India Today","genre":"optional","hlsUrl":"https://indiatodaylive.akamaized.net/hls/live/2014320/indiatoday/indiatodaylive/playlist.m3u8","fallbackVideoId":"sYZtOFzM78M"},"asia/abp-news":{"name":"ABP News","genre":"optional","hlsUrl":"https://d2l4ar6y3mrs4k.cloudfront.net/live-streaming/abpnews-livetv/master.m3u8","fallbackVideoId":"nyd-xznCpJc"},"me/alarabiya":{"name":"AlArabiya","genre":"full","hlsUrl":"https://live.alarabiya.net/alarabiapublish/alarabiya.smil/playlist.m3u8","fallbackVideoId":"n7eQejkXbnM"},"me/aljazeera":{"name":"AlJazeera","genre":"full","hlsUrl":"https://live-hls-apps-aje-fa.getaj.net/AJE/index.m3u8","fallbackVideoId":"gCNeDWCI0vo"},"me/al-hadath":{"name":"Al Hadath","genre":"optional","hlsUrl":"https://av.alarabiya.net/alarabiapublish/alhadath.smil/playlist.m3u8","fallbackVideoId":"xWXpl7azI8k"},"me/sky-news-arabia":{"name":"Sky News Arabia","genre":"optional","hlsUrl":"https://live-stream.skynewsarabia.com/c-horizontal-channel/horizontal-stream/index.m3u8","fallbackVideoId":"U--OjmpjF5o"},"me/trt-world":{"name":"TRT World","genre":"optional","hlsUrl":"https://tv-trtworld.medya.trt.com.tr/master.m3u8","fallbackVideoId":"b8lPrtjmnmw"},"me/cgtn-arabic":{"name":"CGTN Arabic","genre":"optional","hlsUrl":"https://news.cgtn.com/resource/live/arabic/cgtn-a.m3u8","fallbackVideoId":""},"me/kan-11":{"name":"Kan 11","genre":"optional","hlsUrl":"https://kan11.media.kan.org.il/hls/live/2024514/2024514/master.m3u8","fallbackVideoId":"TCnaIE_SAtM"},"me/i24-news":{"name":"i24NEWS (Israel)","genre":"optional","hlsUrl":"https://i24newsenglish-cdn.encoders.immergo.tv/master.m3u8","fallbackVideoId":"myKybZUK0IA"},"me/asharq-news":{"name":"Asharq News","genre":"optional","hlsUrl":"","fallbackVideoId":"f6VpkfV7m4Y"},"me/aljazeera-arabic":{"name":"AlJazeera Arabic","genre":"optional","hlsUrl":"https://live-hls-web-aja.getaj.net/AJA/index.m3u8","fallbackVideoId":"bNyUyrR0PHo"},"me/aljazeera-mubasher":{"name":"Al Jazeera Mubasher","genre":"optional","hlsUrl":"https://live-hls-web-ajm.getaj.net/AJM/index.m3u8","fallbackVideoId":""},"me/alarabiya-business":{"name":"Al Arabiya Business","genre":"optional","hlsUrl":"https://live.alarabiya.net/alarabiapublish/aswaaq.smil/playlist.m3u8","fallbackVideoId":""},"me/al-qahera-news":{"name":"Al Qahera News","genre":"optional","hlsUrl":"https://bcovlive-a.akamaihd.net/d30cbb3350af4cb7a6e05b9eb1bfd850/eu-west-1/6057955906001/playlist.m3u8","fallbackVideoId":""},"me/press-tv":{"name":"Press TV","genre":"optional","hlsUrl":"https://cdnlive.presstv.ir/cdnlive/smil:cdnlive.smil/playlist.m3u8","fallbackVideoId":""},"me/dw-arabic":{"name":"DW Arabic","genre":"optional","hlsUrl":"https://dwamdstream103.akamaized.net/hls/live/2015526/dwstream103/index.m3u8","fallbackVideoId":""},"me/rt-arabic":{"name":"RT Arabic","genre":"optional","hlsUrl":"https://rt-arb.rttv.com/dvr/rtarab/playlist.m3u8","fallbackVideoId":""},"me/rudaw":{"name":"Rudaw","genre":"optional","hlsUrl":"https://svs.itworkscdn.net/rudawlive/rudawlive.smil/playlist.m3u8","fallbackVideoId":""},"africa/ktn-news":{"name":"KTN News","genre":"optional","hlsUrl":"","fallbackVideoId":"RmHtsdVb3mo"},"africa/sabc-news":{"name":"SABC News","genre":"optional","hlsUrl":"https://sabconetanw.cdn.mangomolo.com/news/smil:news.stream.smil/playlist.m3u8","fallbackVideoId":""},"africa/arise-news":{"name":"Arise News","genre":"optional","hlsUrl":"https://liveedge-arisenews.visioncdn.com/live-hls/arisenews/arisenews/arisenews_web/master.m3u8","fallbackVideoId":"4uHZdlX-DT4"},"oc/abc-news-au":{"name":"ABC News Australia","genre":"optional","hlsUrl":"","fallbackVideoId":"vOTiJkg1voo"}};
  const regionsMap = {na:"北米",eu:"ヨーロッパ",latam:"中南米",asia:"アジア",me:"中東",africa:"アフリカ",oc:"オセアニア"};
  const genresMap = {full:"全ジャンル",tech:"テクノロジー・ビジネス",optional:"その他"};

  let inited = false;
  let currentHls = null;
  let regionNav, channelList, playerContainer;

  function stopTv(){
    currentItem = null;
    if (currentHls){ try{currentHls.destroy();}catch(e){} currentHls = null; }
    if (playerContainer){
      playerContainer.innerHTML = '<p class="tv-placeholder">▶︎ 右のリストからチャンネルを選択してください</p>';
    }
    document.querySelectorAll('#tv-page .tv-channel-btn.active').forEach(b=>b.classList.remove('active'));
  }

  function updateActiveRegionBtn(code){
    document.querySelectorAll('#tv-page .tv-region-btn').forEach(b=>{
      b.classList.toggle('active', b.dataset.region === code);
    });
  }

  let currentPlayMode = (typeof localStorage !== 'undefined' && localStorage.getItem('tv_play_mode')) || 'hls';
  let currentItem = null;

  function updatePlayModeUI(){
    const btn = document.getElementById('tvMode');
    if (!btn) return;
    btn.textContent = currentPlayMode === 'education' ? 'EDU' : '通常';
    btn.title = currentPlayMode === 'education'
      ? '再生方法: YouTube Education（クリックで切替）'
      : '再生方法: 通常（クリックで切替）';
    btn.classList.toggle('active', currentPlayMode === 'education');
  }

  function setPlayMode(mode){
    currentPlayMode = mode;
    try{ localStorage.setItem('tv_play_mode', mode); }catch(e){}
    updatePlayModeUI();
    if (currentItem) playMedia(currentItem.hlsUrl, currentItem.fallbackVideoId);
  }

  async function playMedia(hlsUrl, fallbackVideoId){
    if (currentHls){ try{currentHls.destroy();}catch(e){} currentHls = null; }

    const hasHls = !!(hlsUrl && hlsUrl.trim() !== "");
    const hasFallback = !!(fallbackVideoId && fallbackVideoId.trim() !== "");

    let useHls = false, useFallback = false;
    if (hasHls && hasFallback){
      if (currentPlayMode === 'education') useFallback = true; else useHls = true;
    } else if (hasHls){ useHls = true; }
    else if (hasFallback){ useFallback = true; }

    if (useHls){
      playerContainer.innerHTML = '<video id="tv-hls-video" controls autoplay playsinline></video>';
      const video = document.getElementById('tv-hls-video');
      await ensureHls();
      if (window.Hls && Hls.isSupported()){
        currentHls = new Hls();
        currentHls.loadSource(hlsUrl);
        currentHls.attachMedia(video);
        currentHls.on(Hls.Events.MANIFEST_PARSED, ()=>video.play().catch(()=>{}));
        currentHls.on(Hls.Events.ERROR, (_e, data)=>{
          if (data && data.fatal && hasFallback){
            playFallback(fallbackVideoId);
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')){
        video.src = hlsUrl;
        video.addEventListener('loadedmetadata', ()=>video.play().catch(()=>{}));
      } else if (hasFallback){
        playFallback(fallbackVideoId);
      } else {
        playerContainer.innerHTML = '<p class="tv-placeholder">この環境ではHLS再生に対応していません。</p>';
      }
    } else if (useFallback){
      playFallback(fallbackVideoId);
    } else {
      playerContainer.innerHTML = '<p class="tv-placeholder">再生可能なメディアがありません。</p>';
    }
  }

  async function playFallback(videoId){
    const id = encodeURIComponent(videoId);
    let paramText = "";
    try{
      const res = await fetch('/wkt/yt/edurl');
      if (res.ok) paramText = (await res.text()).trim();
    }catch(e){ /* パラメータ取得失敗時は既定値で再生 */ }
    if (!paramText) paramText = '?autoplay=1&rel=0&loop=1';
    const embed = 'https://www.youtubeeducation.com/embed/' + id + paramText + '&playlist=' + id;
    playerContainer.innerHTML = '<iframe src="'+embed+'" allow="autoplay; fullscreen; encrypted-media" allowfullscreen title="YouTube Education Video"></iframe>';
  }

  function initTvPage(){
    if (inited) return;
    regionNav = document.getElementById('tv-region-nav');
    channelList = document.getElementById('tv-channel-list');
    playerContainer = document.getElementById('tv-player-container');
    if (!regionNav || !channelList || !playerContainer) return;

    const grouped = {};
    for (const [key, item] of Object.entries(tvData)){
      const r = key.split('/')[0];
      (grouped[r] ||= []).push(item);
    }

    for (const [code, items] of Object.entries(grouped)){
      const name = regionsMap[code] || code;

      const btn = document.createElement('button');
      btn.className = 'tv-region-btn';
      btn.textContent = name;
      btn.dataset.region = code;
      btn.onclick = (e)=>{
        updateActiveRegionBtn(code);
        const h = document.getElementById('tv-region-' + code);
        if (h) h.scrollIntoView({behavior:'smooth', block:'start'});
        e.currentTarget.blur();
      };
      regionNav.appendChild(btn);

      const header = document.createElement('h3');
      header.id = 'tv-region-' + code;
      header.className = 'tv-region-header';
      header.textContent = name;
      channelList.appendChild(header);

      items.forEach(item=>{
        const cb = document.createElement('button');
        cb.className = 'tv-channel-btn';
        const genre = genresMap[item.genre] || item.genre;
        cb.innerHTML = '<span class="tv-channel-name"></span><span class="tv-channel-genre"></span>';
        cb.querySelector('.tv-channel-name').textContent = item.name;
        cb.querySelector('.tv-channel-genre').textContent = genre;
        cb.onclick = (e)=>{
          document.querySelectorAll('#tv-page .tv-channel-btn').forEach(b=>b.classList.remove('active'));
          cb.classList.add('active');
          updateActiveRegionBtn(code);
          currentItem = item;
          playMedia(item.hlsUrl, item.fallbackVideoId);
          cb.blur();
        };
        channelList.appendChild(cb);
      });
    }

    const first = Object.keys(grouped)[0];
    if (first) updateActiveRegionBtn(first);

    const modeBtn = document.getElementById('tvMode');
    if (modeBtn){
      modeBtn.onclick = ()=>{
        setPlayMode(currentPlayMode === 'education' ? 'hls' : 'education');
        modeBtn.blur();
      };
    }
    updatePlayModeUI();

    channelList.addEventListener('scroll', ()=>{
      const rect = channelList.getBoundingClientRect();
      const headers = channelList.querySelectorAll('h3[id^="tv-region-"]');
      let active = null;
      const atBottom = channelList.scrollHeight - channelList.scrollTop - channelList.clientHeight <= 10;
      if (atBottom && headers.length){
        active = headers[headers.length-1].id.replace('tv-region-','');
      } else {
        for (let i = headers.length-1; i >= 0; i--){
          if (headers[i].getBoundingClientRect().top <= rect.top + 80){
            active = headers[i].id.replace('tv-region-','');
            break;
          }
        }
      }
      if (!active && headers.length) active = headers[0].id.replace('tv-region-','');
      if (active) updateActiveRegionBtn(active);
    });

    // キーボードショートカット（TVページ表示中のみ有効）
    document.addEventListener('keydown', (e)=>{
      const tvPage = document.getElementById('tv-page');
      if (!tvPage || !tvPage.classList.contains('active')) return;
      const v = document.getElementById('tv-hls-video');
      if (!v) return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowRight'){ v.currentTime += 10; }
      else if (e.key === 'ArrowLeft'){ v.currentTime -= 10; }
      else if (e.key === 'f' || e.key === 'F'){
        if (!document.fullscreenElement){ v.requestFullscreen && v.requestFullscreen().catch(()=>{}); }
        else { document.exitFullscreen && document.exitFullscreen(); }
      } else if (e.key === ' ' || e.key === 'Spacebar'){
        e.preventDefault();
        if (v.paused) v.play(); else v.pause();
      }
    });

    inited = true;
  }

  // showPage をラップして TV ページ表示時に初期化・離脱時に停止
  function hookShowPage(){
    if (typeof window.showPage !== 'function'){
      setTimeout(hookShowPage, 50); return;
    }
    if (window.__tvShowPageHooked) return;
    const orig = window.showPage;
    window.showPage = function(name){
      const wasTv = document.getElementById('tv-page')?.classList.contains('active');
      const ret = orig.apply(this, arguments);
      if (name === 'tv'){ initTvPage(); }
      else if (wasTv){ stopTv(); }
      return ret;
    };
    window.__tvShowPageHooked = true;

    // 既に TV ページが active（ディープリンク等）なら初期化
    if (document.getElementById('tv-page')?.classList.contains('active')){
      initTvPage();
    }
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', hookShowPage);
  } else {
    hookShowPage();
  }
})();

;

(function(){
  var SEL = '.section, .link-cat, .news-card, .game-card, .cg-hero-card, .hero, .eq-item';

  // IntersectionObserver が無い/壊れている環境（一部 Chromebook 等）では全表示
  if (typeof IntersectionObserver !== 'function') {
    document.documentElement.classList.add('no-motion');
    return;
  }

  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if (!e.isIntersecting) return;
      var el = e.target;
      var group = el.parentElement ? Array.prototype.filter.call(el.parentElement.children, function(c){return c.classList.contains('rv');}) : [];
      var i = Math.min(group.indexOf(el), 11);
      el.style.transitionDelay = (i > 0 ? i * 60 : 0) + 'ms';
      el.classList.add('rv-in');
      io.unobserve(el);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.01 });

  function observe(root){
    (root || document).querySelectorAll(SEL).forEach(function(el){
      if (el.classList.contains('rv')) return;
      el.classList.add('rv');
      io.observe(el);
    });
  }

  function boot(){
    observe(document);
    new MutationObserver(function(muts){
      muts.forEach(function(m){
        Array.prototype.forEach.call(m.addedNodes, function(n){
          if (n.nodeType !== 1) return;
          if (n.matches && n.matches(SEL)) { n.classList.add('rv'); io.observe(n); }
          observe(n);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });

    // ページ切替時に、表示されたページ内の要素を再観測
    document.addEventListener('click', function(){ setTimeout(function(){ observe(document); }, 30); }, true);

    // ボタンのリップル
    document.addEventListener('pointerdown', function(ev){
      var b = ev.target.closest('button, .gm-btn, .tag-chip, .cg-chip, .cg-hero-play');
      if (!b) return;
      var r = b.getBoundingClientRect();
      b.style.setProperty('--rx', (ev.clientX - r.left) + 'px');
      b.style.setProperty('--ry', (ev.clientY - r.top) + 'px');
      b.classList.remove('rippling');
      void b.offsetWidth;
      b.classList.add('rippling');
      setTimeout(function(){ b.classList.remove('rippling'); }, 600);
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // 保険: 何らかの理由で表示されないままの要素を強制的に見せる
  function safety(){
    document.querySelectorAll('.rv:not(.rv-in)').forEach(function(el){
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight + 200) el.classList.add('rv-in');
    });
  }
  setTimeout(safety, 1200);
  setTimeout(safety, 3000);
  window.addEventListener('load', function(){ setTimeout(safety, 300); });
})();

;

(function(){
  /* ================= 共通ストレージ ================= */
  var PREF_KEY='nk_prefs_v2';
  function loadPrefs(){ try{ return JSON.parse(localStorage.getItem(PREF_KEY)||'{}')||{}; }catch(e){ return {}; } }
  function savePrefs(p){ try{ localStorage.setItem(PREF_KEY, JSON.stringify(p)); }catch(e){} }
  var prefs = loadPrefs();
  function setPref(k,v){ prefs[k]=v; savePrefs(prefs); }

  /* ================= 1. ベル通知の既読タイミング修正 ================= */
  function fixNotif(){
    if (typeof window.toggleNotif !== 'function'){ setTimeout(fixNotif,80); return; }
    var panel=document.getElementById('notifPanel');
    if(!panel) return;
    window.toggleNotif=function(e){
      if(e) e.stopPropagation();
      var open=panel.classList.toggle('open');
      var btn=document.getElementById('settingsBtn');
      if(open){ closeSettingsMenu(); }
      else { markNotifSeen(); }
    };
    window.closeNotif=function(){
      if(panel.classList.contains('open')){ panel.classList.remove('open'); markNotifSeen(); }
    };
    function markNotifSeen(){
      try{
        if(window.NEWS && NEWS[0]) localStorage.setItem('nakayosi_notif_lastseen_v1', NEWS[0].date);
      }catch(err){}
      if(typeof window.renderNotif==='function') setTimeout(window.renderNotif,320);
    }
    document.addEventListener('keydown',function(e){ if(e.key==='Escape') window.closeNotif(); });
  }
  fixNotif();

  /* ================= 2. 設定メニュー ================= */
  window.toggleSettingsMenu=function(e){
    if(e) e.stopPropagation();
    var m=document.getElementById('settingsMenu'), b=document.getElementById('settingsBtn');
    if(!m) return;
    var open=m.classList.toggle('open');
    if(b) b.setAttribute('aria-expanded', open?'true':'false');
    if(open && typeof window.closeNotif==='function') window.closeNotif();
    if(open) syncSettingsUI();
  };
  window.closeSettingsMenu=function(){
    var m=document.getElementById('settingsMenu'), b=document.getElementById('settingsBtn');
    if(m) m.classList.remove('open');
    if(b) b.setAttribute('aria-expanded','false');
  };
  document.addEventListener('click',function(e){
    var w=document.querySelector('.settings-wrap');
    if(w && !w.contains(e.target)) window.closeSettingsMenu();
  });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape') window.closeSettingsMenu(); });

  function syncSettingsUI(){
    var lang=getLang();
    document.querySelectorAll('#smLang button').forEach(function(b){ b.classList.toggle('active', b.dataset.lang===lang); });
    var dark=document.body.classList.contains('dark-mode');
    document.querySelectorAll('#smTheme button').forEach(function(b){ b.classList.toggle('active', (b.dataset.theme==='dark')===dark); });
    var m=document.getElementById('smMotion'); if(m) m.checked = !document.body.classList.contains('no-motion');
    var c=document.getElementById('smClock'); if(c) c.checked = prefs.showClock!==false;
    var w=document.getElementById('smWeather'); if(w) w.checked = prefs.showWeather!==false;
  }

  function applyToggles(){
    document.body.classList.toggle('no-motion', prefs.motion===false);
    var clock=document.getElementById('clock');
    if(clock) clock.style.display = prefs.showClock===false ? 'none' : '';
    var wx=document.getElementById('brandWx');
    if(wx) wx.style.display = prefs.showWeather===false ? 'none' : '';
  }

  function bindSettings(){
    var lang=document.getElementById('smLang');
    if(!lang){ setTimeout(bindSettings,80); return; }
    lang.addEventListener('click',function(e){
      var b=e.target.closest('button[data-lang]'); if(!b) return;
      setLang(b.dataset.lang); syncSettingsUI();
    });
    document.getElementById('smTheme').addEventListener('click',function(e){
      var b=e.target.closest('button[data-theme]'); if(!b) return;
      var wantDark=b.dataset.theme==='dark';
      if(document.body.classList.contains('dark-mode')!==wantDark && typeof window.toggleTheme==='function') window.toggleTheme();
      syncSettingsUI();
    });
    document.getElementById('smMotion').addEventListener('change',function(){ setPref('motion', this.checked); applyToggles(); });
    document.getElementById('smClock').addEventListener('change',function(){ setPref('showClock', this.checked); applyToggles(); });
    document.getElementById('smWeather').addEventListener('change',function(){ setPref('showWeather', this.checked); applyToggles(); });
    applyToggles(); syncSettingsUI();
  }
  bindSettings();

  /* ================= 3. 言語（日本語 / English） ================= */
  var DICT={
    "ホーム":"Home","お知らせ":"News","お知らせ一覧":"All Announcements","新着のお知らせ":"Latest News",
    "リンク":"Links","リンク集":"Links","ゲーム":"Games","設定":"Settings","詳細設定":"Advanced Settings",
    "天気":"Weather","地震":"Earthquake","検索":"Search","チャンネル一覧":"Channels",
    "サイト内を検索…":"Search this site…","チャンネルを検索…":"Search channels…",
    "言語 / Language":"Language","表示モード":"Appearance","ライト":"Light","ダーク":"Dark",
    "アニメーションを有効にする":"Enable animations","ヘッダーに時計を表示":"Show clock in header",
    "ヘッダーに天気を表示":"Show weather in header","詳細設定を開く ›":"Open advanced settings ›",
    "一覧 ›":"View all ›","閉じる":"Close","再読み込み":"Reload","新しいタブで開く":"Open in new tab",
    "チャンネル未選択":"No channel selected","下の一覧から選ぶと再生が始まります":"Pick a channel from the list to start",
    "該当するチャンネルがありません":"No matching channels",
    "▶︎ 一覧からチャンネルを選んでください":"▶︎ Choose a channel from the list",
    "世界のTVニュース":"World TV News","お知らせはありません":"No announcements",
    "CHATを読み込み中...":"Loading chat…","Esc で閉じる":"Press Esc to close",
    "拡大／縮小":"Expand / Restore","全画面":"Fullscreen","停止":"Stop",
    "前のチャンネル":"Previous channel","次のチャンネル":"Next channel",
    "ダーク/ライト":"Dark / Light","通知":"Notifications",
    "ニュース":"News","地震速報":"Earthquake Alerts","利用規約":"Terms","公式サイト":"Official Site",
    "表示切替":"Theme","メニュー":"Menu","サポート":"Support","外部":"External",
    "サイト情報":"Site Info","累計訪問者":"Total visitors","登録リンク数":"Links","登録ゲーム数":"Games",
    "運営者":"Operator","人気リンク":"Popular Links","最近の更新":"Recent Updates",
    "北米":"North America","ヨーロッパ":"Europe","中南米":"Latin America","アジア":"Asia",
    "中東":"Middle East","アフリカ":"Africa","オセアニア":"Oceania",
    "全ジャンル":"General","テクノロジー・ビジネス":"Tech & Business","その他":"Other",
    "更新":"Updated","運営":"Operated by","一覧":"All",
    "チャットの読み込みに時間がかかっています。":"The chat is taking a while to load.",
    "HLS対応チャンネル + YouTubeフォールバック":"HLS channels with YouTube fallback"
  };
  var I18N_SCOPE='header, .gnav, main, .wrap, footer, .settings-menu, .notif-panel, .chat-modal, #tv-page';
  function getLang(){ return prefs.lang==='en' ? 'en' : 'ja'; }

  function translateNode(root, toEn){
    var walker=document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var n;
    while((n=walker.nextNode())){
      var raw=n.nodeValue, t=raw.trim();
      if(!t) continue;
      if(toEn){
        if(DICT[t]){
          if(!n.__ja) n.__ja=raw;
          n.nodeValue=raw.replace(t, DICT[t]);
        } else {
          // 絵文字＋語句のパターンにも対応
          var m=t.match(/^([^\p{L}\p{N}]*)(.+?)([^\p{L}\p{N}]*)$/u);
          if(m && DICT[m[2]]){
            if(!n.__ja) n.__ja=raw;
            n.nodeValue=raw.replace(m[2], DICT[m[2]]);
          }
        }
      } else if(n.__ja){
        n.nodeValue=n.__ja; n.__ja=null;
      }
    }
    root.querySelectorAll('[placeholder],[title],[aria-label]').forEach(function(el){
      ['placeholder','title','aria-label'].forEach(function(a){
        var v=el.getAttribute(a); if(!v) return;
        var key='__'+a;
        if(toEn){
          if(DICT[v.trim()]){ if(!el[key]) el[key]=v; el.setAttribute(a, DICT[v.trim()]); }
        } else if(el[key]){ el.setAttribute(a, el[key]); el[key]=null; }
      });
    });
  }

  function applyI18n(){
    var toEn=getLang()==='en';
    document.documentElement.lang = toEn?'en':'ja';
    document.querySelectorAll(I18N_SCOPE).forEach(function(root){ translateNode(root, toEn); });
  }
  function setLang(l){ setPref('lang', l); applyI18n(); }
  window.__setSiteLang=setLang;

  var i18nTimer=null;
  function scheduleI18n(){
    if(getLang()!=='en') return;
    clearTimeout(i18nTimer);
    i18nTimer=setTimeout(applyI18n,150);
  }

  /* ================= 4. タップ／クリック アニメーション ================= */
  var RIPPLE_SEL='button, .gm-btn, .tag-chip, .cg-chip, .cg-hero-play, .icon-btn, .gnav a, .tv-ctl, .chat-iconbtn, .link-cat li a, .game-card, .news-card, .cg-hero-card, #tv-page .tv-channel-btn, #tv-page .tv-region-btn';
  var pressed=null, startY=0, cancelled=false;

  function pressStart(x,y,target){
    if(document.body.classList.contains('no-motion')) return;
    var b=target.closest && target.closest(RIPPLE_SEL);
    if(!b) return;
    pressed=b; cancelled=false; startY=y;
    b.classList.add('tap-ripple','is-pressed');
    var r=b.getBoundingClientRect();
    b.style.setProperty('--rx',(x-r.left)+'px');
    b.style.setProperty('--ry',(y-r.top)+'px');
    b.classList.remove('rippling');
    void b.offsetWidth;
    b.classList.add('rippling');
    setTimeout(function(){ b.classList.remove('rippling'); },560);
  }
  function pressEnd(){
    if(pressed){ pressed.classList.remove('is-pressed'); pressed=null; }
  }
  document.addEventListener('touchstart',function(ev){
    var t=ev.touches&&ev.touches[0]; if(!t) return;
    pressStart(t.clientX,t.clientY,ev.target);
  },{passive:true, capture:true});
  document.addEventListener('touchmove',function(ev){
    var t=ev.touches&&ev.touches[0];
    if(pressed && t && Math.abs(t.clientY-startY)>8){ pressed.classList.remove('rippling'); pressEnd(); }
  },{passive:true, capture:true});
  document.addEventListener('touchend',pressEnd,{passive:true, capture:true});
  document.addEventListener('touchcancel',pressEnd,{passive:true, capture:true});
  document.addEventListener('mousedown',function(ev){ if(ev.button===0) pressStart(ev.clientX,ev.clientY,ev.target); },true);
  document.addEventListener('mouseup',pressEnd,true);
  document.addEventListener('mouseleave',pressEnd,true);

  /* ================= 5. TV 改善 ================= */
  var tvLast=null;
  function tvButtons(){
    return Array.prototype.filter.call(
      document.querySelectorAll('#tv-channel-list .tv-channel-btn'),
      function(b){ return b.style.display!=='none'; }
    );
  }
  function decorateChannels(){
    document.querySelectorAll('#tv-channel-list .tv-channel-btn').forEach(function(b){
      if(b.dataset.decorated) return;
      var nameEl=b.querySelector('.tv-channel-name'), genreEl=b.querySelector('.tv-channel-genre');
      if(!nameEl) return;
      var name=nameEl.textContent||'';
      var badge=document.createElement('span');
      badge.className='tv-ch-badge';
      badge.textContent=name.replace(/[^A-Za-z0-9\u3040-\u30ff\u4e00-\u9faf]/g,'').slice(0,2).toUpperCase()||'TV';
      var text=document.createElement('span');
      text.className='tv-ch-text';
      text.appendChild(nameEl);
      if(genreEl) text.appendChild(genreEl);
      b.insertBefore(text,b.firstChild);
      b.insertBefore(badge,b.firstChild);
      b.dataset.name=name;
      b.dataset.decorated='1';
    });
  }
  function updateNowBar(btn){
    var name=document.getElementById('tv-now-name'), sub=document.getElementById('tv-now-sub'), bar=document.getElementById('tv-nowbar');
    if(!name||!sub||!bar) return;
    if(!btn){
      bar.classList.remove('live');
      name.textContent = getLang()==='en' ? 'No channel selected' : 'チャンネル未選択';
      sub.textContent = getLang()==='en' ? 'Pick a channel from the list to start' : '下の一覧から選ぶと再生が始まります';
      return;
    }
    var region='';
    var h=btn.previousElementSibling;
    while(h && !(h.tagName==='H3')) h=h.previousElementSibling;
    if(h) region=h.textContent;
    bar.classList.add('live');
    name.textContent=btn.dataset.name||'';
    var g=btn.querySelector('.tv-channel-genre');
    sub.textContent=[region,(g?g.textContent:'')].filter(Boolean).join(' ・ ');
    try{ localStorage.setItem('nk_tv_last', btn.dataset.name||''); }catch(e){}
    tvLast=btn;
  }
  function tvFilter(q){
    q=(q||'').trim().toLowerCase();
    var list=document.getElementById('tv-channel-list');
    if(!list) return;
    var shown=0;
    list.querySelectorAll('.tv-channel-btn').forEach(function(b){
      var ok=!q || (b.dataset.name||'').toLowerCase().indexOf(q)>=0;
      b.style.display = ok?'':'none';
      if(ok) shown++;
    });
    list.querySelectorAll('h3[id^="tv-region-"]').forEach(function(h){
      var any=false, n=h.nextElementSibling;
      while(n && n.tagName!=='H3'){ if(n.style.display!=='none') any=true; n=n.nextElementSibling; }
      h.style.display=(!q||any)?'':'none';
    });
    var empty=document.getElementById('tvEmpty');
    if(empty) empty.hidden = shown>0;
  }
  function tvStep(dir){
    var btns=tvButtons(); if(!btns.length) return;
    var i=btns.indexOf(document.querySelector('#tv-channel-list .tv-channel-btn.active'));
    var next=btns[(i<0?0:(i+dir+btns.length))%btns.length];
    if(next) next.click();
  }
  function bindTv(){
    var list=document.getElementById('tv-channel-list');
    if(!list){ setTimeout(bindTv,200); return; }
    list.addEventListener('click',function(e){
      var b=e.target.closest('.tv-channel-btn'); if(!b) return;
      decorateChannels();
      setTimeout(function(){ updateNowBar(b); },0);
    });
    var s=document.getElementById('tvSearch');
    if(s) s.addEventListener('input',function(){ tvFilter(this.value); });
    var prev=document.getElementById('tvPrev'), next=document.getElementById('tvNext'),
        fs=document.getElementById('tvFs'), stop=document.getElementById('tvStop');
    if(prev) prev.onclick=function(){ tvStep(-1); };
    if(next) next.onclick=function(){ tvStep(1); };
    if(fs) fs.onclick=function(){
      var p=document.getElementById('tv-player-container'); if(!p) return;
      var v=p.querySelector('video');
      var el=v||p;
      if(!document.fullscreenElement){ (el.requestFullscreen? el.requestFullscreen(): el.webkitRequestFullscreen && el.webkitRequestFullscreen()); }
      else { document.exitFullscreen && document.exitFullscreen(); }
    };
    if(stop) stop.onclick=function(){
      if(typeof window.stopTv==='function'){ window.stopTv(); }
      else {
        var p=document.getElementById('tv-player-container');
        if(p) p.innerHTML='<p class="tv-placeholder">'+(getLang()==='en'?'▶︎ Choose a channel from the list':'▶︎ 一覧からチャンネルを選んでください')+'</p>';
        document.querySelectorAll('#tv-channel-list .tv-channel-btn.active').forEach(function(b){b.classList.remove('active');});
      }
      updateNowBar(null);
    };
    var mo=new MutationObserver(function(){ decorateChannels(); scheduleI18n(); });
    mo.observe(list,{childList:true});
    decorateChannels();
  }
  bindTv();

  /* ================= 6. CHAT 改善 ================= */
  function bindChat(){
    var modal=document.getElementById('chat-modal');
    var frame=document.getElementById('chat-iframe');
    if(!modal||!frame){ setTimeout(bindChat,200); return; }
    var wrap=frame.parentElement;
    if(!document.getElementById('chat-fallback')){
      var fb=document.createElement('div');
      fb.id='chat-fallback'; fb.className='chat-fallback';
      fb.innerHTML='<div>チャットの読み込みに時間がかかっています。</div><a href="https://zoomies-connect.lovable.app/room/nakayosi-instace-2-mc" target="_blank" rel="noopener">新しいタブで開く</a>';
      wrap.appendChild(fb);
    }
    var fbTimer=null;
    frame.addEventListener('load',function(){
      clearTimeout(fbTimer);
      document.getElementById('chat-fallback').classList.remove('show');
      var l=document.getElementById('chat-loading'); if(l) l.classList.add('hidden');
    });
    var origOpen=window.openChatModal;
    window.openChatModal=function(){
      if(typeof origOpen==='function') origOpen();
      modal.classList.toggle('expanded', prefs.chatExpanded===true);
      clearTimeout(fbTimer);
      fbTimer=setTimeout(function(){
        var l=document.getElementById('chat-loading');
        if(l && !l.classList.contains('hidden')) document.getElementById('chat-fallback').classList.add('show');
      },9000);
      scheduleI18n();
    };
    var origClose=window.closeChatModal;
    window.closeChatModal=function(){
      if(typeof origClose==='function') origClose();
      clearTimeout(fbTimer);
    };
    window.toggleChatExpand=function(){
      var on=!modal.classList.contains('expanded');
      modal.classList.toggle('expanded',on);
      setPref('chatExpanded',on);
    };
  }
  bindChat();

  /* ================= 起動処理 ================= */
  function boot(){
    applyToggles();
    document.body.classList.toggle('tv-active', !!(document.getElementById('tv-page')&&document.getElementById('tv-page').classList.contains('active')));
    if(getLang()==='en') applyI18n();
    syncSettingsUI();
    var target=document.querySelector('main')||document.body;
    var mo=new MutationObserver(scheduleI18n);
    mo.observe(target,{childList:true,subtree:true});
    if(typeof window.showPage==='function'){
      var orig=window.showPage;
      window.showPage=function(){
        var r=orig.apply(this,arguments);
        setTimeout(function(){
          document.body.classList.toggle('tv-active', !!document.getElementById('tv-page') && document.getElementById('tv-page').classList.contains('active'));
          decorateChannels(); scheduleI18n();
        },60);
        return r;
      };
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();

;

(function(){
  function ready(f){document.readyState==='loading'?document.addEventListener('DOMContentLoaded',f):f();}
  ready(function(){
    var gnav=document.getElementById('gnav');
    var links=document.getElementById('gnavLinks');
    function closeDrawer(){ if(gnav) gnav.classList.remove('open'); document.body.style.overflow=''; }
    function openState(){ document.body.style.overflow = gnav.classList.contains('open') ? 'hidden' : ''; }

    if(links && !links.querySelector('.drawer-close')){
      var cb=document.createElement('button');
      cb.className='drawer-close';cb.setAttribute('aria-label','メニューを閉じる');cb.innerHTML='✕';
      cb.addEventListener('click',closeDrawer);
      links.insertBefore(cb,links.firstChild);
    }
    // メニュー項目タップで閉じる
    if(links) links.addEventListener('click',function(e){
      if(e.target.closest('a')) closeDrawer();
    });
    // 背景オーバーレイのタップで閉じる
    if(gnav) gnav.addEventListener('click',function(e){
      if(e.target===gnav) closeDrawer();
    });
    var mt=gnav&&gnav.querySelector('.menu-toggle');
    if(mt) mt.addEventListener('click',function(){setTimeout(openState,0);});
    document.addEventListener('keydown',function(e){if(e.key==='Escape')closeDrawer();});

    // 下部タブバー
    function svg(d){return '<svg class="mi" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+d+'</svg>';}
    var items=[
      {p:'home',i:svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>'),t:'ホーム'},
      {p:'weather',i:svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/>'),t:'天気'},
      {p:'links',i:svg('<path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/>'),t:'リンク'},
      {p:'games',i:svg('<rect x="2" y="7" width="20" height="11" rx="4"/><path d="M7 12h3M8.5 10.5v3M16 11.5h.01M18 13.5h.01"/>'),t:'ゲーム'}
    ];
    var bar=document.createElement('nav');
    bar.className='mnav';bar.setAttribute('aria-label','モバイルナビ');
    items.forEach(function(it){
      var b=document.createElement('button');
      b.dataset.page=it.p;
      b.innerHTML=it.i+'<span>'+it.t+'</span>';
      b.addEventListener('click',function(){
        closeDrawer();
        if(typeof window.showPage==='function') window.showPage(it.p);
        window.scrollTo({top:0,behavior:'smooth'});
      });
      bar.appendChild(b);
    });
    document.body.appendChild(bar);

    function syncActive(){
      var cur=document.querySelector('.page.active,[id$="-page"].active');
      var id=cur?cur.id.replace('-page',''):'home';
      bar.querySelectorAll('button').forEach(function(b){
        b.classList.toggle('active', b.dataset.page===id);
      });
    }
    syncActive();
    if(typeof window.showPage==='function'){
      var orig=window.showPage;
      window.showPage=function(){var r=orig.apply(this,arguments);setTimeout(syncActive,60);return r;};
    }

    // トップへ戻る
    var top=document.createElement('button');
    top.className='to-top';top.setAttribute('aria-label','ページ上部へ');top.innerHTML='↑';
    top.addEventListener('click',function(){window.scrollTo({top:0,behavior:'smooth'});});
    document.body.appendChild(top);
    window.addEventListener('scroll',function(){
      top.classList.toggle('show', window.scrollY>500);
    },{passive:true});
  });
})();

;

(function(){
  var canvas, ctx, parts = [], raf = null;
  function ensure(){
    if(canvas) return;
    canvas = document.createElement('canvas');
    canvas.id = 'egg-canvas';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }
  function resize(){
    if(!canvas) return;
    var d = window.devicePixelRatio || 1;
    canvas.width = innerWidth * d; canvas.height = innerHeight * d;
    ctx.setTransform(d,0,0,d,0,0);
  }
  function toast(msg){
    var t = document.getElementById('egg-toast');
    if(!t){ t = document.createElement('div'); t.id = 'egg-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    requestAnimationFrame(function(){ t.classList.add('show'); });
    clearTimeout(t._tm);
    t._tm = setTimeout(function(){ t.classList.remove('show'); }, 2600);
  }
  function loop(){
    raf = null;
    if(!ctx) return;
    ctx.clearRect(0,0,innerWidth,innerHeight);
    for(var i=parts.length-1;i>=0;i--){
      var p = parts[i];
      p.vy += p.g; p.vx *= p.fr; p.vy *= p.fr;
      p.x += p.vx; p.y += p.vy; p.life -= 1; p.rot += p.vr;
      if(p.life <= 0 || p.y > innerHeight + 60){ parts.splice(i,1); continue; }
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.fade));
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      if(p.shape === 'circle'){ ctx.beginPath(); ctx.arc(0,0,p.s/2,0,6.2832); ctx.fill(); }
      else if(p.shape === 'star'){
        ctx.beginPath();
        for(var k=0;k<10;k++){ var r = k%2 ? p.s*0.4 : p.s; var a = Math.PI*k/5;
          ctx[k?'lineTo':'moveTo'](Math.cos(a)*r, Math.sin(a)*r); }
        ctx.closePath(); ctx.fill();
      }
      else if(p.shape === 'heart'){
        ctx.beginPath();
        var w = p.s;
        ctx.moveTo(0, w*0.3);
        ctx.bezierCurveTo(w, -w*0.5, w*0.5, -w, 0, -w*0.35);
        ctx.bezierCurveTo(-w*0.5, -w, -w, -w*0.5, 0, w*0.3);
        ctx.fill();
      }
      else { ctx.fillRect(-p.s/2, -p.s/2, p.s, p.s*0.6); }
      ctx.restore();
    }
    if(parts.length) raf = requestAnimationFrame(loop);
    else ctx.clearRect(0,0,innerWidth,innerHeight);
  }
  function start(){ ensure(); if(!raf) raf = requestAnimationFrame(loop); }
  function spawn(n, fn){
    ensure();
    for(var i=0;i<n;i++) parts.push(fn(i));
    start();
  }
  var rnd = function(a,b){ return a + Math.random()*(b-a); };
  var pick = function(arr){ return arr[Math.floor(Math.random()*arr.length)]; };

  function confetti(){
    var cols = ['#f43f5e','#f59e0b','#22c55e','#3b82f6','#a855f7','#06b6d4'];
    spawn(140, function(){
      return { x: rnd(0,innerWidth), y: rnd(-innerHeight*0.4,0), vx: rnd(-1.5,1.5), vy: rnd(1,4),
        g: 0.06, fr: 0.995, s: rnd(6,13), c: pick(cols), rot: rnd(0,6), vr: rnd(-0.2,0.2),
        life: rnd(140,230), fade: 90, shape: 'rect' };
    });
  }
  function fireworks(){
    var bursts = 5;
    for(var b=0;b<bursts;b++){
      (function(b){
        setTimeout(function(){
          var cx = rnd(innerWidth*0.15, innerWidth*0.85), cy = rnd(innerHeight*0.15, innerHeight*0.5);
          var col = 'hsl(' + Math.floor(rnd(0,360)) + ' 95% 62%)';
          spawn(70, function(){
            var a = Math.random()*6.2832, sp = rnd(1.5,6.5);
            return { x: cx, y: cy, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp, g: 0.045, fr: 0.975,
              s: rnd(3,6), c: col, rot: 0, vr: 0, life: rnd(60,110), fade: 60, shape: 'circle' };
          });
        }, b*380);
      })(b);
    }
  }
  function snow(){
    spawn(160, function(){
      return { x: rnd(0,innerWidth), y: rnd(-innerHeight,0), vx: rnd(-.5,.5), vy: rnd(.6,1.8),
        g: 0.002, fr: 1, s: rnd(3,8), c: 'rgba(255,255,255,.95)', rot: 0, vr: 0,
        life: rnd(300,520), fade: 120, shape: 'circle' };
    });
  }
  function sakura(){
    var cols = ['#ffd7e6','#ffb7d1','#ff9ec4','#ffe3ef'];
    spawn(120, function(){
      return { x: rnd(0,innerWidth), y: rnd(-innerHeight,0), vx: rnd(-1,1), vy: rnd(.8,2),
        g: 0.003, fr: 1, s: rnd(7,13), c: pick(cols), rot: rnd(0,6), vr: rnd(-.06,.06),
        life: rnd(300,520), fade: 120, shape: 'circle' };
    });
  }
  function hearts(){
    var cols = ['#ff4d6d','#ff8fa3','#e11d48','#ffb3c1'];
    spawn(70, function(){
      return { x: rnd(0,innerWidth), y: rnd(innerHeight*0.6, innerHeight+40), vx: rnd(-.6,.6), vy: rnd(-2.6,-1.1),
        g: -0.004, fr: 1, s: rnd(7,15), c: pick(cols), rot: rnd(-.3,.3), vr: rnd(-.02,.02),
        life: rnd(180,280), fade: 90, shape: 'heart' };
    });
  }
  function stars(){
    var cols = ['#fde68a','#fcd34d','#fbbf24','#fff7cc'];
    spawn(90, function(){
      return { x: rnd(0,innerWidth), y: rnd(-innerHeight*0.5,0), vx: rnd(-.8,.8), vy: rnd(1,3),
        g: 0.02, fr: 0.999, s: rnd(4,9), c: pick(cols), rot: rnd(0,6), vr: rnd(-.12,.12),
        life: rnd(180,300), fade: 100, shape: 'star' };
    });
  }
  function rainDrops(){
    spawn(220, function(){
      return { x: rnd(0,innerWidth), y: rnd(-innerHeight,0), vx: 0.6, vy: rnd(9,16),
        g: 0.2, fr: 1, s: rnd(2,3), c: 'rgba(147,197,253,.9)', rot: 0, vr: 0,
        life: rnd(80,140), fade: 60, shape: 'rect' };
    });
  }
  function bodyFx(cls, ms){
    document.body.classList.add(cls);
    setTimeout(function(){ document.body.classList.remove(cls); }, ms);
  }

  var EGGS = [
    { keys:['お祝い','おめでとう','パーティー','ぱーてぃー','紙吹雪','congrats','party','confetti','祝'], run:function(){ confetti(); toast('🎉 おめでとう！'); } },
    { keys:['花火','はなび','hanabi','firework','fireworks'], run:function(){ fireworks(); toast('🎆 花火だ！'); } },
    { keys:['雪','ゆき','snow','クリスマス','christmas'], run:function(){ snow(); toast('❄️ 雪が降ってきた'); } },
    { keys:['桜','さくら','sakura','春','花見'], run:function(){ sakura(); toast('🌸 桜が舞う'); } },
    { keys:['好き','すき','愛','ハート','love','heart'], run:function(){ hearts(); toast('💗 ラブ！'); } },
    { keys:['星','ほし','star','宇宙','space','流星'], run:function(){ stars(); toast('⭐ 星が降る'); } },
    { keys:['雨','あめ','rain','梅雨'], run:function(){ rainDrops(); toast('☔ 雨が降ってきた'); } },
    { keys:['回転','くるくる','barrel roll','do a barrel roll','spin','ロール'], run:function(){ bodyFx('egg-spin',1500); toast('🌀 ぐるぐる！'); } },
    { keys:['地震','じしん','earthquake','ゆれ','揺れ'], run:function(){ bodyFx('egg-shake',1400); toast('🫨 ぐらぐら…'); } },
    { keys:['傾く','askew','tilt','ななめ','斜め'], run:function(){ bodyFx('egg-tilt',3000); toast('📐 ちょっと斜め'); } },
    { keys:['仲良し','なかよし','nakayosi','インスタンス'], run:function(){ confetti(); setTimeout(fireworks,250); toast('✨ 仲良し *インスタンス* 2 へようこそ！'); } }
  ];

  var lastEgg = '', timer = null;
  function check(raw){
    var q = String(raw||'').trim().toLowerCase();
    if(!q){ lastEgg = ''; return; }
    for(var i=0;i<EGGS.length;i++){
      var e = EGGS[i];
      for(var k=0;k<e.keys.length;k++){
        if(q === e.keys[k].toLowerCase() || q.indexOf(e.keys[k].toLowerCase()) !== -1){
          var id = i + ':' + q;
          if(id === lastEgg) return;
          lastEgg = id;
          try{ e.run(); }catch(err){}
          return;
        }
      }
    }
    lastEgg = '';
  }
  window.runSearchEasterEgg = check;

  function bind(){
    var input = document.getElementById('searchInput');
    if(!input) return;
    input.addEventListener('input', function(){
      var v = this.value;
      clearTimeout(timer);
      timer = setTimeout(function(){ check(v); }, 320);
    });
    input.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ clearTimeout(timer); lastEgg = ''; check(this.value); }
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();

;

(function(){
  'use strict';
  const monitorState = { selected: null, lastDataAt: null };
  const mapSvg = "<svg viewBox=\"0 0 120 100\" aria-hidden=\"true\" focusable=\"false\" preserveAspectRatio=\"none\"><path class=\"earthquake-japan-land\" d=\"M 65.18 47.56 L 64.63 47.67 L 64.27 47.33 L 64.34 47.01 L 64.68 47.04 L 65.43 46.64 L 66.12 46.46 L 66.54 46.84 L 65.96 47.40 L 65.97 47.55 L 66.27 47.28 L 66.37 47.45 L 66.22 47.45 L 66.22 47.56 L 66.65 47.65 L 66.58 47.95 L 66.73 47.75 L 66.99 47.82 L 66.98 47.66 L 66.72 47.71 L 66.71 47.49 L 67.13 47.42 L 67.31 47.26 L 67.26 47.42 L 67.43 47.46 L 67.25 47.62 L 67.37 47.71 L 67.30 47.87 L 67.63 48.09 L 67.64 48.27 L 68.50 48.44 L 68.84 48.38 L 69.16 48.74 L 69.29 48.69 L 69.15 49.00 L 69.28 49.28 L 69.08 49.79 L 69.13 50.04 L 69.39 50.24 L 69.33 50.49 L 69.49 50.59 L 69.70 50.49 L 69.73 50.67 L 70.03 50.71 L 70.28 51.19 L 70.14 51.34 L 69.63 51.10 L 69.45 51.32 L 68.78 51.24 L 68.64 51.01 L 68.72 50.89 L 68.37 50.46 L 68.00 50.33 L 68.06 50.13 L 67.87 50.13 L 67.78 50.28 L 67.90 50.35 L 67.71 50.38 L 67.41 50.23 L 67.44 50.04 L 66.91 49.95 L 66.95 49.41 L 66.41 49.34 L 66.37 49.20 L 65.93 49.22 L 65.98 49.08 L 65.78 48.97 L 65.79 48.82 L 65.54 48.79 L 65.34 48.92 L 65.28 48.80 L 64.63 48.59 L 64.67 48.15 L 64.95 48.24 L 65.24 48.15 L 65.18 47.56 Z\" /><path class=\"earthquake-japan-land\" d=\"M 67.12 46.93 L 67.12 46.93 Z\" /><path class=\"earthquake-japan-land\" d=\"M 67.39 47.30 L 67.39 47.30 Z\" /><path class=\"earthquake-japan-land\" d=\"M 66.69 47.76 L 66.69 47.76 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.31 56.42 L 39.31 56.28 L 39.31 56.42 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.47 56.39 L 39.47 56.39 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.18 56.44 L 39.18 56.44 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.79 56.53 L 38.71 56.46 L 38.84 56.45 L 38.79 56.53 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.37 56.62 L 39.40 56.51 L 39.37 56.62 Z\" /><path class=\"earthquake-japan-land\" d=\"M 40.19 56.96 L 41.38 56.92 L 41.98 57.15 L 42.05 57.30 L 42.48 57.07 L 42.68 57.10 L 42.68 57.53 L 42.40 57.59 L 42.24 57.89 L 42.15 57.76 L 42.07 57.94 L 41.86 57.99 L 41.88 58.09 L 41.69 58.17 L 41.77 58.45 L 41.60 58.44 L 41.44 58.42 L 41.23 58.17 L 41.07 58.18 L 41.11 58.34 L 40.75 58.58 L 40.61 58.52 L 40.56 58.63 L 41.10 59.27 L 40.43 59.21 L 40.04 59.00 L 39.61 58.68 L 39.77 58.56 L 39.71 58.34 L 39.09 58.26 L 39.07 57.99 L 38.79 57.77 L 38.95 57.54 L 39.26 57.76 L 39.14 57.56 L 39.34 57.24 L 38.91 57.03 L 39.03 56.89 L 39.18 57.07 L 39.29 57.03 L 39.16 56.93 L 39.14 56.74 L 39.28 56.79 L 39.23 56.57 L 39.37 56.74 L 39.48 56.59 L 39.78 56.68 L 39.68 56.92 L 39.81 56.89 L 39.84 57.02 L 40.10 57.06 L 40.19 56.96 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.84 56.69 L 39.84 56.69 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.94 56.95 L 39.94 56.95 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.28 57.26 L 39.28 57.26 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.30 57.28 L 39.30 57.28 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.18 57.64 L 39.18 57.64 Z\" /><path class=\"earthquake-japan-land\" d=\"M 41.09 59.32 L 41.09 59.32 Z\" /><path class=\"earthquake-japan-land\" d=\"M 45.55 58.26 L 46.31 59.20 L 46.27 59.58 L 46.64 59.85 L 46.32 59.88 L 46.17 60.25 L 45.58 60.71 L 45.54 60.99 L 45.25 60.97 L 45.09 61.16 L 45.09 61.64 L 45.55 62.14 L 45.21 62.50 L 45.54 62.91 L 45.06 62.85 L 44.86 63.09 L 44.52 63.03 L 44.28 63.18 L 43.79 63.20 L 43.51 63.16 L 43.02 62.79 L 42.69 63.01 L 42.02 63.09 L 41.80 62.82 L 41.89 62.84 L 42.01 62.57 L 42.20 62.56 L 42.14 62.44 L 42.44 62.29 L 42.32 62.15 L 42.53 62.03 L 42.44 61.97 L 42.87 61.66 L 42.71 61.39 L 42.86 61.32 L 42.69 61.21 L 43.30 60.77 L 42.29 60.88 L 42.30 60.76 L 43.04 60.40 L 42.95 60.16 L 43.07 60.03 L 42.92 59.81 L 42.61 59.76 L 42.61 59.63 L 42.22 59.48 L 42.07 59.08 L 42.53 59.08 L 42.48 58.85 L 42.90 58.57 L 43.29 58.59 L 43.40 58.31 L 44.94 58.98 L 45.12 58.69 L 44.89 58.45 L 44.96 58.26 L 45.55 58.26 Z\" /><path class=\"earthquake-japan-land\" d=\"M 42.11 61.15 L 41.97 60.97 L 42.20 60.79 L 42.26 61.12 L 42.11 61.15 Z\" /><path class=\"earthquake-japan-land\" d=\"M 42.43 61.02 L 42.36 60.89 L 42.54 60.88 L 42.43 61.02 Z\" /><path class=\"earthquake-japan-land\" d=\"M 41.70 60.91 L 41.70 60.91 Z\" /><path class=\"earthquake-japan-land\" d=\"M 42.24 60.94 L 42.24 60.94 Z\" /><path class=\"earthquake-japan-land\" d=\"M 42.35 60.94 L 42.35 60.94 Z\" /><path class=\"earthquake-japan-land\" d=\"M 42.32 61.18 L 42.36 60.97 L 42.32 61.18 Z\" /><path class=\"earthquake-japan-land\" d=\"M 41.91 61.00 L 41.91 61.00 Z\" /><path class=\"earthquake-japan-land\" d=\"M 42.27 61.06 L 42.27 61.06 Z\" /><path class=\"earthquake-japan-land\" d=\"M 40.52 61.14 L 40.52 61.14 Z\" /><path class=\"earthquake-japan-land\" d=\"M 41.77 61.80 L 41.30 61.77 L 41.17 61.89 L 41.22 61.78 L 41.05 61.68 L 41.02 62.16 L 40.86 62.23 L 40.79 62.11 L 40.69 62.28 L 40.83 62.29 L 40.46 62.48 L 40.39 62.67 L 40.00 62.77 L 40.05 62.56 L 39.84 62.53 L 40.06 62.28 L 40.16 62.39 L 40.14 62.28 L 40.30 62.38 L 40.35 62.27 L 39.88 62.14 L 40.23 61.42 L 40.10 61.21 L 40.22 61.31 L 40.92 61.15 L 41.00 61.60 L 41.59 61.28 L 41.91 61.25 L 41.96 61.37 L 42.30 61.23 L 42.01 61.84 L 41.78 61.92 L 41.77 61.80 Z\" /><path class=\"earthquake-japan-land\" d=\"M 41.95 61.17 L 41.95 61.17 Z\" /><path class=\"earthquake-japan-land\" d=\"M 42.09 61.19 L 42.09 61.19 Z\" /><path class=\"earthquake-japan-land\" d=\"M 40.97 61.18 L 40.97 61.18 Z\" /><path class=\"earthquake-japan-land\" d=\"M 42.01 61.20 L 42.01 61.20 Z\" /><path class=\"earthquake-japan-land\" d=\"M 42.19 61.22 L 42.19 61.22 Z\" /><path class=\"earthquake-japan-land\" d=\"M 42.17 61.23 L 42.17 61.23 Z\" /><path class=\"earthquake-japan-land\" d=\"M 41.87 61.24 L 41.87 61.24 Z\" /><path class=\"earthquake-japan-land\" d=\"M 42.13 61.27 L 42.13 61.27 Z\" /><path class=\"earthquake-japan-land\" d=\"M 42.45 61.44 L 42.45 61.44 Z\" /><path class=\"earthquake-japan-land\" d=\"M 41.15 61.80 L 41.15 61.80 Z\" /><path class=\"earthquake-japan-land\" d=\"M 41.16 61.82 L 41.16 61.82 Z\" /><path class=\"earthquake-japan-land\" d=\"M 42.10 61.97 L 42.07 61.82 L 42.18 61.90 L 42.10 61.97 Z\" /><path class=\"earthquake-japan-land\" d=\"M 41.63 61.88 L 41.63 61.88 Z\" /><path class=\"earthquake-japan-land\" d=\"M 42.03 61.88 L 42.03 61.88 Z\" /><path class=\"earthquake-japan-land\" d=\"M 41.68 61.89 L 41.68 61.89 Z\" /><path class=\"earthquake-japan-land\" d=\"M 41.59 61.95 L 41.59 61.95 Z\" /><path class=\"earthquake-japan-land\" d=\"M 41.15 61.97 L 41.15 61.97 Z\" /><path class=\"earthquake-japan-land\" d=\"M 41.52 61.97 L 41.52 61.97 Z\" /><path class=\"earthquake-japan-land\" d=\"M 41.74 62.00 L 41.74 62.00 Z\" /><path class=\"earthquake-japan-land\" d=\"M 41.55 62.09 L 41.51 61.99 L 41.70 62.02 L 41.55 62.09 Z\" /><path class=\"earthquake-japan-land\" d=\"M 41.79 62.04 L 41.79 62.04 Z\" /><path class=\"earthquake-japan-land\" d=\"M 41.51 62.26 L 41.87 62.05 L 41.51 62.26 Z\" /><path class=\"earthquake-japan-land\" d=\"M 41.44 62.11 L 41.44 62.11 Z\" /><path class=\"earthquake-japan-land\" d=\"M 41.06 62.11 L 41.06 62.11 Z\" /><path class=\"earthquake-japan-land\" d=\"M 41.50 62.17 L 41.50 62.17 Z\" /><path class=\"earthquake-japan-land\" d=\"M 40.68 62.44 L 40.68 62.44 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.85 62.72 L 39.85 62.72 Z\" /><path class=\"earthquake-japan-land\" d=\"M 40.35 62.75 L 40.35 62.75 Z\" /><path class=\"earthquake-japan-land\" d=\"M 41.81 62.75 L 41.81 62.75 Z\" /><path class=\"earthquake-japan-land\" d=\"M 40.23 62.92 L 40.09 62.79 L 40.23 62.92 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.86 62.83 L 39.86 62.83 Z\" /><path class=\"earthquake-japan-land\" d=\"M 40.06 62.81 L 40.06 62.81 Z\" /><path class=\"earthquake-japan-land\" d=\"M 40.24 62.85 L 40.24 62.85 Z\" /><path class=\"earthquake-japan-land\" d=\"M 40.26 62.90 L 40.26 62.90 Z\" /><path class=\"earthquake-japan-land\" d=\"M 40.22 62.94 L 40.22 62.94 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.87 62.98 L 39.87 62.98 Z\" /><path class=\"earthquake-japan-land\" d=\"M 61.66 51.99 L 61.82 52.00 L 61.69 52.57 L 61.59 52.46 L 61.39 52.51 L 61.57 52.46 L 61.48 52.36 L 61.16 52.66 L 61.14 52.36 L 60.71 52.41 L 60.90 52.33 L 60.78 52.25 L 60.86 52.14 L 61.66 51.99 Z\" /><path class=\"earthquake-japan-land\" d=\"M 60.80 52.15 L 60.80 52.15 Z\" /><path class=\"earthquake-japan-land\" d=\"M 60.78 52.19 L 60.78 52.19 Z\" /><path class=\"earthquake-japan-land\" d=\"M 60.73 52.20 L 60.73 52.20 Z\" /><path class=\"earthquake-japan-land\" d=\"M 59.85 52.25 L 59.85 52.25 Z\" /><path class=\"earthquake-japan-land\" d=\"M 60.03 52.28 L 60.12 52.24 L 60.10 52.37 L 60.03 52.28 Z\" /><path class=\"earthquake-japan-land\" d=\"M 59.87 52.28 L 59.87 52.28 Z\" /><path class=\"earthquake-japan-land\" d=\"M 60.40 52.46 L 60.18 52.35 L 60.51 52.31 L 60.40 52.46 Z\" /><path class=\"earthquake-japan-land\" d=\"M 59.91 52.33 L 59.91 52.33 Z\" /><path class=\"earthquake-japan-land\" d=\"M 59.94 52.37 L 59.94 52.37 Z\" /><path class=\"earthquake-japan-land\" d=\"M 60.59 52.40 L 60.59 52.40 Z\" /><path class=\"earthquake-japan-land\" d=\"M 59.86 52.39 L 59.86 52.39 Z\" /><path class=\"earthquake-japan-land\" d=\"M 59.96 52.53 L 59.84 52.37 L 60.06 52.48 L 59.96 52.53 Z\" /><path class=\"earthquake-japan-land\" d=\"M 59.98 52.41 L 59.98 52.41 Z\" /><path class=\"earthquake-japan-land\" d=\"M 59.79 52.42 L 59.79 52.42 Z\" /><path class=\"earthquake-japan-land\" d=\"M 60.93 52.42 L 60.93 52.42 Z\" /><path class=\"earthquake-japan-land\" d=\"M 60.01 52.45 L 60.01 52.45 Z\" /><path class=\"earthquake-japan-land\" d=\"M 59.79 52.48 L 59.79 52.48 Z\" /><path class=\"earthquake-japan-land\" d=\"M 61.62 52.52 L 61.62 52.52 Z\" /><path class=\"earthquake-japan-land\" d=\"M 60.03 52.57 L 60.03 52.57 Z\" /><path class=\"earthquake-japan-land\" d=\"M 61.74 52.56 L 61.74 52.56 Z\" /><path class=\"earthquake-japan-land\" d=\"M 60.27 52.65 L 60.30 52.57 L 60.27 52.65 Z\" /><path class=\"earthquake-japan-land\" d=\"M 59.03 52.67 L 59.03 52.67 Z\" /><path class=\"earthquake-japan-land\" d=\"M 60.61 52.65 L 60.61 52.65 Z\" /><path class=\"earthquake-japan-land\" d=\"M 59.60 52.64 L 59.60 52.64 Z\" /><path class=\"earthquake-japan-land\" d=\"M 58.89 52.67 L 58.89 52.67 Z\" /><path class=\"earthquake-japan-land\" d=\"M 60.51 52.72 L 60.51 52.72 Z\" /><path class=\"earthquake-japan-land\" d=\"M 60.61 52.68 L 60.61 52.68 Z\" /><path class=\"earthquake-japan-land\" d=\"M 60.67 52.68 L 60.67 52.68 Z\" /><path class=\"earthquake-japan-land\" d=\"M 58.33 52.81 L 58.26 52.69 L 58.37 52.68 L 58.33 52.81 Z\" /><path class=\"earthquake-japan-land\" d=\"M 60.20 52.82 L 60.28 52.69 L 60.20 52.82 Z\" /><path class=\"earthquake-japan-land\" d=\"M 59.05 52.71 L 59.05 52.71 Z\" /><path class=\"earthquake-japan-land\" d=\"M 58.90 52.72 L 58.90 52.72 Z\" /><path class=\"earthquake-japan-land\" d=\"M 58.82 52.87 L 58.76 52.74 L 58.97 52.78 L 58.82 52.87 Z\" /><path class=\"earthquake-japan-land\" d=\"M 58.50 52.95 L 58.56 52.73 L 58.65 52.86 L 58.50 52.95 Z\" /><path class=\"earthquake-japan-land\" d=\"M 60.67 53.86 L 60.61 54.01 L 60.25 54.01 L 59.98 54.21 L 59.69 54.02 L 59.16 54.10 L 58.40 54.49 L 57.99 54.35 L 58.17 54.22 L 58.24 53.67 L 57.79 53.36 L 58.36 53.42 L 58.37 53.54 L 59.14 53.08 L 59.09 52.94 L 59.28 52.92 L 59.17 53.07 L 59.42 53.00 L 59.48 52.80 L 60.39 52.97 L 60.46 52.80 L 60.61 52.91 L 60.67 52.73 L 60.81 52.80 L 60.83 53.06 L 61.05 52.87 L 61.33 53.02 L 61.31 53.26 L 61.89 53.36 L 62.20 53.60 L 62.09 53.83 L 61.75 53.70 L 60.87 53.74 L 60.67 53.86 Z\" /><path class=\"earthquake-japan-land\" d=\"M 60.87 52.77 L 60.87 52.77 Z\" /><path class=\"earthquake-japan-land\" d=\"M 59.62 52.76 L 59.62 52.76 Z\" /><path class=\"earthquake-japan-land\" d=\"M 59.11 52.80 L 59.11 52.80 Z\" /><path class=\"earthquake-japan-land\" d=\"M 59.16 52.78 L 59.16 52.78 Z\" /><path class=\"earthquake-japan-land\" d=\"M 58.26 52.85 L 58.26 52.85 Z\" /><path class=\"earthquake-japan-land\" d=\"M 59.27 52.86 L 59.27 52.86 Z\" /><path class=\"earthquake-japan-land\" d=\"M 58.87 52.92 L 58.87 52.92 Z\" /><path class=\"earthquake-japan-land\" d=\"M 58.11 53.04 L 58.09 52.93 L 58.11 53.04 Z\" /><path class=\"earthquake-japan-land\" d=\"M 58.22 53.03 L 58.22 53.03 Z\" /><path class=\"earthquake-japan-land\" d=\"M 58.38 53.16 L 58.32 53.07 L 58.38 53.16 Z\" /><path class=\"earthquake-japan-land\" d=\"M 58.11 53.18 L 58.11 53.18 Z\" /><path class=\"earthquake-japan-land\" d=\"M 58.11 53.38 L 58.12 53.24 L 58.27 53.27 L 58.11 53.38 Z\" /><path class=\"earthquake-japan-land\" d=\"M 58.40 53.33 L 58.40 53.33 Z\" /><path class=\"earthquake-japan-land\" d=\"M 58.15 53.65 L 58.15 53.65 Z\" /><path class=\"earthquake-japan-land\" d=\"M 58.17 53.67 L 58.17 53.67 Z\" /><path class=\"earthquake-japan-land\" d=\"M 57.28 53.85 L 57.28 53.85 Z\" /><path class=\"earthquake-japan-land\" d=\"M 57.66 53.98 L 57.66 53.98 Z\" /><path class=\"earthquake-japan-land\" d=\"M 74.80 48.12 L 74.96 48.07 L 74.89 48.16 L 75.24 48.34 L 75.41 48.67 L 75.83 48.72 L 75.93 48.85 L 76.54 48.68 L 77.15 48.99 L 77.84 48.68 L 77.73 48.85 L 77.89 49.10 L 78.41 48.93 L 79.19 49.03 L 79.01 49.17 L 79.14 49.30 L 78.96 49.39 L 79.00 49.52 L 78.59 49.84 L 78.54 50.13 L 78.20 50.49 L 77.43 50.86 L 77.42 51.48 L 75.09 51.92 L 75.37 51.54 L 75.59 51.66 L 76.30 51.38 L 76.42 51.22 L 76.42 51.46 L 76.53 51.46 L 76.54 51.25 L 76.76 51.24 L 76.60 51.22 L 76.65 51.00 L 76.49 50.86 L 76.08 50.80 L 75.85 51.07 L 75.84 50.97 L 75.14 51.01 L 74.75 50.80 L 74.91 50.19 L 74.81 50.57 L 74.64 50.61 L 74.57 51.04 L 74.86 51.38 L 74.20 51.07 L 74.33 50.74 L 74.11 50.53 L 74.10 50.15 L 74.35 49.96 L 74.34 49.71 L 74.48 49.62 L 74.34 49.58 L 74.23 49.85 L 74.25 49.65 L 74.14 49.62 L 74.19 49.86 L 73.98 49.77 L 73.97 49.93 L 73.85 49.90 L 73.73 49.63 L 73.36 49.39 L 73.39 48.90 L 73.85 48.32 L 74.17 48.38 L 74.80 48.12 Z\" /><path class=\"earthquake-japan-land\" d=\"M 74.06 50.02 L 74.11 49.92 L 74.06 50.02 Z\" /><path class=\"earthquake-japan-land\" d=\"M 74.10 50.23 L 74.10 50.23 Z\" /><path class=\"earthquake-japan-land\" d=\"M 74.04 50.73 L 74.00 50.56 L 74.11 50.63 L 74.04 50.73 Z\" /><path class=\"earthquake-japan-land\" d=\"M 76.53 50.89 L 76.53 50.89 Z\" /><path class=\"earthquake-japan-land\" d=\"M 76.53 50.98 L 76.62 50.97 L 76.53 50.98 Z\" /><path class=\"earthquake-japan-land\" d=\"M 76.15 50.97 L 76.15 50.97 Z\" /><path class=\"earthquake-japan-land\" d=\"M 75.49 51.07 L 75.49 51.07 Z\" /><path class=\"earthquake-japan-land\" d=\"M 76.59 51.21 L 76.59 51.21 Z\" /><path class=\"earthquake-japan-land\" d=\"M 75.25 51.29 L 75.15 51.24 L 75.25 51.29 Z\" /><path class=\"earthquake-japan-land\" d=\"M 76.71 51.27 L 76.71 51.27 Z\" /><path class=\"earthquake-japan-land\" d=\"M 76.25 51.32 L 76.25 51.32 Z\" /><path class=\"earthquake-japan-land\" d=\"M 75.00 51.36 L 75.00 51.36 Z\" /><path class=\"earthquake-japan-land\" d=\"M 75.03 51.51 L 75.04 51.43 L 75.03 51.51 Z\" /><path class=\"earthquake-japan-land\" d=\"M 75.63 51.60 L 75.63 51.60 Z\" /><path class=\"earthquake-japan-land\" d=\"M 75.47 51.58 L 75.47 51.58 Z\" /><path class=\"earthquake-japan-land\" d=\"M 89.81 40.21 L 90.69 40.43 L 91.02 40.80 L 91.25 40.79 L 91.28 41.98 L 91.46 42.22 L 91.10 42.34 L 91.30 43.10 L 90.93 43.64 L 90.65 43.57 L 90.22 43.75 L 89.87 43.73 L 89.57 43.92 L 89.55 44.09 L 89.24 44.04 L 89.11 44.36 L 88.64 44.54 L 88.32 44.51 L 88.11 44.21 L 87.32 44.22 L 86.81 43.71 L 87.18 43.34 L 87.11 43.14 L 87.42 42.81 L 86.64 42.57 L 86.86 42.06 L 86.77 41.94 L 87.03 41.68 L 86.74 41.58 L 86.78 41.46 L 87.30 41.05 L 88.88 40.49 L 89.11 40.52 L 89.08 40.37 L 89.33 40.24 L 89.81 40.21 Z\" /><path class=\"earthquake-japan-land\" d=\"M 81.85 45.58 L 82.20 45.67 L 82.36 45.92 L 82.95 45.82 L 83.05 46.03 L 83.38 46.05 L 83.64 45.87 L 84.46 46.18 L 84.72 46.12 L 85.13 46.73 L 85.65 46.94 L 85.65 47.44 L 84.37 48.27 L 83.40 48.37 L 83.36 48.21 L 83.32 48.19 L 83.05 48.21 L 82.91 47.97 L 82.79 48.03 L 82.56 48.57 L 82.66 49.08 L 82.46 49.23 L 82.15 49.17 L 81.98 49.06 L 81.83 48.58 L 81.64 48.51 L 81.43 48.62 L 81.24 48.49 L 81.16 48.29 L 81.34 47.66 L 80.90 46.76 L 81.18 46.56 L 80.93 46.39 L 81.19 45.99 L 81.42 46.09 L 81.85 45.58 Z\" /><path class=\"earthquake-japan-land\" d=\"M 70.75 46.83 L 71.40 46.99 L 71.44 47.18 L 71.62 47.20 L 71.59 47.51 L 71.86 47.46 L 72.00 47.59 L 71.94 47.78 L 72.22 48.23 L 72.07 48.31 L 71.89 48.90 L 72.27 49.31 L 72.07 50.09 L 71.83 50.43 L 71.25 50.65 L 70.55 50.45 L 70.43 50.56 L 70.63 50.63 L 70.45 50.85 L 70.13 50.95 L 70.03 50.71 L 69.73 50.67 L 69.70 50.49 L 69.49 50.59 L 69.33 50.49 L 69.39 50.24 L 69.13 50.04 L 69.08 49.79 L 69.28 49.30 L 69.15 49.00 L 69.30 48.71 L 69.16 48.74 L 68.82 48.43 L 69.08 48.12 L 69.45 48.16 L 69.70 47.63 L 70.03 47.77 L 70.13 47.59 L 70.53 47.60 L 70.57 47.35 L 70.84 47.43 L 70.67 46.96 L 70.75 46.83 Z\" /><path class=\"earthquake-japan-land\" d=\"M 83.22 43.58 L 82.45 43.63 L 82.00 43.48 L 82.14 42.74 L 82.36 42.53 L 82.63 42.49 L 82.57 42.32 L 83.56 42.10 L 83.63 41.98 L 83.95 42.07 L 84.13 41.95 L 84.11 41.74 L 84.64 41.67 L 84.62 41.44 L 84.90 41.40 L 84.83 41.01 L 85.23 40.97 L 85.49 40.64 L 86.21 41.23 L 86.97 41.31 L 86.74 41.58 L 87.03 41.68 L 86.77 41.94 L 86.86 42.06 L 86.64 42.57 L 87.42 42.81 L 87.11 43.14 L 87.18 43.34 L 86.81 43.71 L 87.32 44.22 L 88.11 44.21 L 88.35 44.49 L 88.12 44.61 L 87.94 44.50 L 87.29 44.59 L 86.80 44.30 L 86.62 44.41 L 85.65 44.17 L 85.21 44.87 L 84.79 44.89 L 84.14 45.28 L 83.78 45.30 L 83.56 45.52 L 83.16 45.33 L 83.23 44.91 L 82.89 44.69 L 83.18 44.66 L 83.00 44.19 L 83.27 44.08 L 83.22 43.58 Z\" /><path class=\"earthquake-japan-land\" d=\"M 97.42 31.92 L 97.55 31.80 L 98.16 31.95 L 98.37 32.42 L 98.19 32.26 L 98.03 32.36 L 97.88 32.25 L 98.02 32.60 L 97.58 32.86 L 97.82 33.00 L 97.80 33.23 L 97.63 33.11 L 97.47 33.30 L 97.22 33.30 L 97.22 33.44 L 97.65 33.47 L 97.30 33.74 L 97.48 33.94 L 97.66 33.87 L 97.71 34.08 L 97.35 33.99 L 97.48 34.11 L 97.38 34.25 L 97.56 34.31 L 97.24 34.36 L 97.36 34.57 L 97.51 34.47 L 97.69 34.55 L 97.41 34.65 L 97.67 34.81 L 97.62 35.13 L 97.25 34.93 L 97.37 34.86 L 97.31 34.77 L 97.09 34.78 L 97.29 34.66 L 97.16 34.55 L 96.87 34.62 L 96.79 34.48 L 96.33 34.46 L 95.80 34.70 L 95.89 34.91 L 95.69 34.90 L 95.67 34.65 L 95.31 34.68 L 95.13 34.91 L 95.45 34.99 L 95.00 35.12 L 95.23 35.16 L 94.93 35.37 L 94.64 35.97 L 94.66 36.83 L 94.28 36.86 L 94.29 37.25 L 93.88 37.24 L 93.96 37.39 L 93.47 37.26 L 93.45 36.87 L 93.34 36.84 L 93.31 36.82 L 92.84 36.71 L 92.44 36.82 L 92.38 36.60 L 92.04 36.48 L 91.76 36.59 L 91.38 36.44 L 91.39 36.11 L 91.86 36.10 L 92.11 35.97 L 92.40 35.54 L 92.36 35.14 L 92.89 34.58 L 92.90 34.37 L 93.10 34.29 L 92.82 34.04 L 92.89 33.78 L 92.69 33.48 L 93.00 33.46 L 93.12 33.22 L 93.04 33.09 L 93.23 32.87 L 93.03 32.80 L 92.96 32.57 L 92.71 32.45 L 92.74 32.32 L 93.19 32.35 L 93.73 32.01 L 94.13 31.98 L 94.93 32.38 L 95.70 32.37 L 95.53 32.62 L 96.17 32.96 L 96.55 32.62 L 96.97 32.73 L 97.05 32.87 L 97.19 32.80 L 97.26 32.38 L 97.46 32.20 L 97.42 31.92 Z\" /><path class=\"earthquake-japan-land\" d=\"M 98.13 32.59 L 98.01 32.40 L 98.12 32.34 L 98.13 32.59 Z\" /><path class=\"earthquake-japan-land\" d=\"M 98.22 32.54 L 98.22 32.54 Z\" /><path class=\"earthquake-japan-land\" d=\"M 97.56 33.86 L 97.56 33.86 Z\" /><path class=\"earthquake-japan-land\" d=\"M 97.50 34.19 L 97.50 34.19 Z\" /><path class=\"earthquake-japan-land\" d=\"M 97.64 34.37 L 97.58 34.25 L 97.64 34.37 Z\" /><path class=\"earthquake-japan-land\" d=\"M 97.96 34.44 L 97.96 34.44 Z\" /><path class=\"earthquake-japan-land\" d=\"M 97.97 34.56 L 97.97 34.56 Z\" /><path class=\"earthquake-japan-land\" d=\"M 98.01 34.61 L 98.01 34.61 Z\" /><path class=\"earthquake-japan-land\" d=\"M 97.12 34.65 L 97.12 34.65 Z\" /><path class=\"earthquake-japan-land\" d=\"M 95.36 34.70 L 95.36 34.70 Z\" /><path class=\"earthquake-japan-land\" d=\"M 95.43 34.71 L 95.43 34.71 Z\" /><path class=\"earthquake-japan-land\" d=\"M 95.38 34.71 L 95.38 34.71 Z\" /><path class=\"earthquake-japan-land\" d=\"M 95.80 34.76 L 95.80 34.76 Z\" /><path class=\"earthquake-japan-land\" d=\"M 95.62 34.78 L 95.62 34.78 Z\" /><path class=\"earthquake-japan-land\" d=\"M 95.57 34.79 L 95.57 34.79 Z\" /><path class=\"earthquake-japan-land\" d=\"M 95.61 34.78 L 95.61 34.78 Z\" /><path class=\"earthquake-japan-land\" d=\"M 95.62 34.88 L 95.65 34.78 L 95.62 34.88 Z\" /><path class=\"earthquake-japan-land\" d=\"M 95.55 34.86 L 95.55 34.86 Z\" /><path class=\"earthquake-japan-land\" d=\"M 95.57 34.81 L 95.57 34.81 Z\" /><path class=\"earthquake-japan-land\" d=\"M 95.27 34.84 L 95.27 34.84 Z\" /><path class=\"earthquake-japan-land\" d=\"M 95.26 34.83 L 95.26 34.83 Z\" /><path class=\"earthquake-japan-land\" d=\"M 95.53 34.87 L 95.43 34.84 L 95.53 34.87 Z\" /><path class=\"earthquake-japan-land\" d=\"M 95.35 34.89 L 95.35 34.89 Z\" /><path class=\"earthquake-japan-land\" d=\"M 95.81 34.92 L 95.81 34.92 Z\" /><path class=\"earthquake-japan-land\" d=\"M 97.87 35.14 L 97.74 34.99 L 97.78 34.96 L 97.84 34.94 L 97.95 34.99 L 97.87 35.14 Z\" /><path class=\"earthquake-japan-land\" d=\"M 97.05 35.07 L 97.08 34.94 L 97.15 35.03 L 97.05 35.07 Z\" /><path class=\"earthquake-japan-land\" d=\"M 97.51 35.24 L 97.30 35.07 L 97.51 35.24 Z\" /><path class=\"earthquake-japan-land\" d=\"M 81.09 47.07 L 81.34 47.66 L 81.16 48.29 L 81.24 48.49 L 81.43 48.62 L 81.79 48.56 L 81.99 49.09 L 82.20 49.19 L 82.46 49.23 L 82.66 49.08 L 82.56 48.57 L 82.67 48.50 L 82.67 48.13 L 82.91 47.97 L 83.05 48.21 L 83.32 48.19 L 83.36 48.21 L 83.40 48.37 L 85.01 48.19 L 85.09 48.50 L 84.88 48.93 L 85.14 49.32 L 85.56 49.36 L 85.34 49.74 L 85.50 49.79 L 85.48 50.11 L 85.74 50.29 L 85.24 51.06 L 84.99 51.17 L 84.94 51.56 L 84.74 51.48 L 84.22 51.81 L 83.70 51.41 L 83.70 51.24 L 83.88 51.13 L 83.76 50.82 L 83.88 50.65 L 83.78 50.53 L 83.95 50.42 L 83.82 50.17 L 83.90 49.92 L 84.45 49.92 L 84.53 49.78 L 84.14 49.51 L 83.42 49.34 L 82.78 49.54 L 82.47 49.85 L 82.51 50.06 L 82.52 49.93 L 82.67 49.94 L 82.57 50.08 L 81.79 50.39 L 81.50 51.04 L 81.13 51.24 L 80.99 51.50 L 81.13 51.84 L 80.32 51.56 L 78.99 51.62 L 77.42 51.48 L 77.43 50.86 L 78.20 50.49 L 78.54 50.13 L 78.59 49.84 L 79.00 49.52 L 79.14 49.04 L 80.71 48.32 L 80.60 47.96 L 80.80 47.86 L 80.71 47.48 L 80.95 47.37 L 81.09 47.07 Z\" /><path class=\"earthquake-japan-land\" d=\"M 85.84 49.83 L 85.84 49.83 Z\" /><path class=\"earthquake-japan-land\" d=\"M 84.44 49.86 L 84.44 49.86 Z\" /><path class=\"earthquake-japan-land\" d=\"M 81.09 51.73 L 81.09 51.73 Z\" /><path class=\"earthquake-japan-land\" d=\"M 92.84 41.19 L 93.90 41.52 L 94.03 41.68 L 93.73 41.91 L 93.58 42.44 L 93.06 43.24 L 93.13 43.72 L 92.80 44.29 L 93.05 45.06 L 93.51 45.74 L 93.31 45.78 L 93.37 45.92 L 93.45 45.99 L 93.40 45.91 L 93.39 45.85 L 93.54 45.80 L 94.23 46.64 L 93.73 46.45 L 93.53 46.20 L 93.16 46.10 L 92.56 45.64 L 92.44 45.78 L 92.51 45.88 L 92.29 45.79 L 91.59 46.07 L 90.73 46.16 L 89.70 45.73 L 88.93 44.98 L 88.65 45.05 L 88.46 44.67 L 88.46 44.52 L 89.11 44.36 L 89.24 44.04 L 89.55 44.09 L 89.57 43.92 L 89.87 43.73 L 90.96 43.62 L 91.30 43.10 L 91.10 42.34 L 91.46 42.22 L 91.28 42.01 L 91.26 41.24 L 91.49 41.23 L 91.84 41.45 L 91.89 41.65 L 92.32 41.86 L 92.96 41.49 L 92.84 41.19 Z\" /><path class=\"earthquake-japan-land\" d=\"M 93.56 45.72 L 93.56 45.72 Z\" /><path class=\"earthquake-japan-land\" d=\"M 31.17 82.46 L 31.10 82.34 L 31.17 82.46 Z\" /><path class=\"earthquake-japan-land\" d=\"M 29.67 86.39 L 29.75 86.17 L 30.10 85.93 L 29.67 86.39 Z\" /><path class=\"earthquake-japan-land\" d=\"M 29.60 86.41 L 29.60 86.41 Z\" /><path class=\"earthquake-japan-land\" d=\"M 29.75 86.49 L 29.75 86.49 Z\" /><path class=\"earthquake-japan-land\" d=\"M 29.69 86.77 L 29.56 86.66 L 29.68 86.57 L 29.78 86.66 L 29.69 86.77 Z\" /><path class=\"earthquake-japan-land\" d=\"M 29.65 86.86 L 29.65 86.86 Z\" /><path class=\"earthquake-japan-land\" d=\"M 30.77 87.65 L 30.76 87.52 L 31.15 87.29 L 31.24 86.95 L 31.52 87.07 L 31.63 87.50 L 31.19 88.03 L 30.74 88.05 L 30.75 88.19 L 30.61 88.17 L 30.75 88.33 L 30.47 88.48 L 30.16 88.40 L 30.26 88.55 L 29.98 88.60 L 29.74 88.92 L 29.34 88.83 L 29.15 88.95 L 29.60 89.57 L 29.32 89.35 L 29.19 89.40 L 28.78 89.98 L 28.88 90.13 L 29.10 90.04 L 29.15 90.14 L 28.62 90.49 L 28.29 90.54 L 28.34 90.30 L 28.23 90.25 L 28.29 90.24 L 28.34 90.22 L 28.18 90.01 L 28.36 89.97 L 28.34 89.79 L 28.79 89.51 L 28.55 88.91 L 28.98 88.93 L 29.21 88.62 L 29.59 88.56 L 29.90 88.31 L 29.47 88.16 L 29.39 87.69 L 30.01 87.78 L 29.91 87.96 L 30.12 88.06 L 30.63 87.92 L 30.50 87.83 L 30.77 87.65 Z\" /><path class=\"earthquake-japan-land\" d=\"M 31.67 87.52 L 31.67 87.52 Z\" /><path class=\"earthquake-japan-land\" d=\"M 29.03 87.70 L 28.77 87.69 L 28.74 87.64 L 28.76 87.58 L 29.03 87.55 L 29.15 87.64 L 29.14 87.68 L 29.03 87.70 Z\" /><path class=\"earthquake-japan-land\" d=\"M 30.10 87.75 L 30.06 87.67 L 30.10 87.75 Z\" /><path class=\"earthquake-japan-land\" d=\"M 30.16 87.98 L 29.97 87.86 L 30.09 87.82 L 30.16 87.98 Z\" /><path class=\"earthquake-japan-land\" d=\"M 30.51 87.89 L 30.51 87.89 Z\" /><path class=\"earthquake-japan-land\" d=\"M 29.31 88.05 L 29.33 87.94 L 29.31 88.05 Z\" /><path class=\"earthquake-japan-land\" d=\"M 29.09 87.98 L 29.09 87.98 Z\" /><path class=\"earthquake-japan-land\" d=\"M 30.15 88.02 L 30.15 88.02 Z\" /><path class=\"earthquake-japan-land\" d=\"M 26.04 88.30 L 26.15 88.18 L 26.23 88.24 L 26.04 88.30 Z\" /><path class=\"earthquake-japan-land\" d=\"M 29.98 89.17 L 29.99 89.09 L 29.98 89.17 Z\" /><path class=\"earthquake-japan-land\" d=\"M 23.63 89.34 L 23.55 89.23 L 23.89 89.13 L 24.12 89.34 L 24.05 89.59 L 23.63 89.34 Z\" /><path class=\"earthquake-japan-land\" d=\"M 25.49 89.18 L 25.49 89.18 Z\" /><path class=\"earthquake-japan-land\" d=\"M 29.66 89.40 L 29.93 89.17 L 29.97 89.27 L 29.66 89.40 Z\" /><path class=\"earthquake-japan-land\" d=\"M 25.73 89.33 L 25.72 89.18 L 25.73 89.33 Z\" /><path class=\"earthquake-japan-land\" d=\"M 24.43 89.34 L 24.43 89.34 Z\" /><path class=\"earthquake-japan-land\" d=\"M 29.22 89.39 L 29.35 89.41 L 29.22 89.39 Z\" /><path class=\"earthquake-japan-land\" d=\"M 24.21 89.38 L 24.21 89.38 Z\" /><path class=\"earthquake-japan-land\" d=\"M 24.12 89.39 L 24.12 89.39 Z\" /><path class=\"earthquake-japan-land\" d=\"M 24.31 89.37 L 24.31 89.37 Z\" /><path class=\"earthquake-japan-land\" d=\"M 24.26 89.38 L 24.26 89.38 Z\" /><path class=\"earthquake-japan-land\" d=\"M 29.79 89.51 L 29.75 89.42 L 29.79 89.51 Z\" /><path class=\"earthquake-japan-land\" d=\"M 29.65 89.49 L 29.65 89.49 Z\" /><path class=\"earthquake-japan-land\" d=\"M 29.95 89.56 L 29.95 89.56 Z\" /><path class=\"earthquake-japan-land\" d=\"M 27.71 89.71 L 27.71 89.71 Z\" /><path class=\"earthquake-japan-land\" d=\"M 27.88 89.74 L 27.88 89.74 Z\" /><path class=\"earthquake-japan-land\" d=\"M 27.89 89.73 L 27.89 89.73 Z\" /><path class=\"earthquake-japan-land\" d=\"M 29.71 89.81 L 29.68 89.72 L 29.71 89.81 Z\" /><path class=\"earthquake-japan-land\" d=\"M 27.03 89.79 L 27.03 89.79 Z\" /><path class=\"earthquake-japan-land\" d=\"M 26.52 89.92 L 26.41 89.85 L 26.65 89.82 L 26.52 89.92 Z\" /><path class=\"earthquake-japan-land\" d=\"M 27.27 89.83 L 27.27 89.83 Z\" /><path class=\"earthquake-japan-land\" d=\"M 26.83 89.89 L 26.83 89.89 Z\" /><path class=\"earthquake-japan-land\" d=\"M 27.25 89.88 L 27.25 89.88 Z\" /><path class=\"earthquake-japan-land\" d=\"M 26.74 90.25 L 26.78 89.88 L 26.86 89.99 L 26.74 90.25 Z\" /><path class=\"earthquake-japan-land\" d=\"M 27.20 90.00 L 27.25 89.89 L 27.20 90.00 Z\" /><path class=\"earthquake-japan-land\" d=\"M 26.21 89.97 L 26.21 89.97 Z\" /><path class=\"earthquake-japan-land\" d=\"M 26.43 89.93 L 26.43 89.93 Z\" /><path class=\"earthquake-japan-land\" d=\"M 26.56 90.01 L 26.55 90.01 L 26.54 89.93 L 26.56 90.01 Z\" /><path class=\"earthquake-japan-land\" d=\"M 26.38 90.06 L 26.40 89.94 L 26.38 90.06 Z\" /><path class=\"earthquake-japan-land\" d=\"M 26.88 90.02 L 26.88 90.02 Z\" /><path class=\"earthquake-japan-land\" d=\"M 26.43 90.11 L 26.43 90.11 Z\" /><path class=\"earthquake-japan-land\" d=\"M 26.20 90.17 L 26.18 90.09 L 26.20 90.17 Z\" /><path class=\"earthquake-japan-land\" d=\"M 26.46 90.18 L 26.46 90.18 Z\" /><path class=\"earthquake-japan-land\" d=\"M 29.42 90.22 L 29.54 90.14 L 29.42 90.22 Z\" /><path class=\"earthquake-japan-land\" d=\"M 26.68 90.19 L 26.68 90.19 Z\" /><path class=\"earthquake-japan-land\" d=\"M 26.36 90.20 L 26.36 90.20 Z\" /><path class=\"earthquake-japan-land\" d=\"M 26.45 90.20 L 26.45 90.20 Z\" /><path class=\"earthquake-japan-land\" d=\"M 26.70 90.28 L 26.70 90.28 Z\" /><path class=\"earthquake-japan-land\" d=\"M 28.86 90.33 L 28.86 90.33 Z\" /><path class=\"earthquake-japan-land\" d=\"M 46.53 91.23 L 46.43 91.09 L 46.66 91.13 L 46.53 91.23 Z\" /><path class=\"earthquake-japan-land\" d=\"M 8.42 91.28 L 8.42 91.28 Z\" /><path class=\"earthquake-japan-land\" d=\"M 46.15 91.76 L 46.10 91.53 L 46.31 91.51 L 46.32 91.71 L 46.15 91.76 Z\" /><path class=\"earthquake-japan-land\" d=\"M 7.30 92.11 L 7.47 92.07 L 7.30 92.11 Z\" /><path class=\"earthquake-japan-land\" d=\"M 7.71 92.16 L 7.71 92.16 Z\" /><path class=\"earthquake-japan-land\" d=\"M 7.78 92.18 L 7.78 92.18 Z\" /><path class=\"earthquake-japan-land\" d=\"M 16.23 95.82 L 16.15 95.75 L 16.23 95.82 Z\" /><path class=\"earthquake-japan-land\" d=\"M 16.53 95.85 L 16.53 95.85 Z\" /><path class=\"earthquake-japan-land\" d=\"M 16.53 96.77 L 16.25 96.57 L 16.41 96.59 L 16.28 96.39 L 16.47 96.16 L 16.26 95.86 L 16.66 96.37 L 17.34 96.73 L 16.53 96.77 Z\" /><path class=\"earthquake-japan-land\" d=\"M 15.91 96.31 L 15.81 96.07 L 16.09 96.24 L 15.91 96.31 Z\" /><path class=\"earthquake-japan-land\" d=\"M 15.91 96.31 L 15.72 96.33 L 15.69 96.17 L 15.91 96.31 Z\" /><path class=\"earthquake-japan-land\" d=\"M 13.50 96.61 L 13.42 96.58 L 13.38 96.55 L 13.50 96.61 Z\" /><path class=\"earthquake-japan-land\" d=\"M 16.23 96.76 L 16.20 96.68 L 16.23 96.76 Z\" /><path class=\"earthquake-japan-land\" d=\"M 13.45 97.09 L 13.35 96.96 L 13.60 96.96 L 13.45 97.09 Z\" /><path class=\"earthquake-japan-land\" d=\"M 10.87 98.51 L 10.54 98.35 L 10.70 98.13 L 10.56 98.04 L 10.41 98.12 L 10.37 97.95 L 10.58 97.98 L 10.56 97.82 L 10.68 98.00 L 11.09 97.94 L 11.13 97.74 L 11.38 97.71 L 11.54 97.24 L 11.68 97.26 L 11.24 97.89 L 11.23 98.38 L 10.87 98.51 Z\" /><path class=\"earthquake-japan-land\" d=\"M 9.11 97.88 L 9.11 97.88 Z\" /><path class=\"earthquake-japan-land\" d=\"M 5.06 98.01 L 4.67 97.96 L 4.81 97.85 L 5.21 97.89 L 5.06 98.01 Z\" /><path class=\"earthquake-japan-land\" d=\"M 45.93 97.90 L 45.93 97.90 Z\" /><path class=\"earthquake-japan-land\" d=\"M 10.73 97.95 L 10.73 97.95 Z\" /><path class=\"earthquake-japan-land\" d=\"M 9.36 98.84 L 8.60 98.64 L 8.60 98.69 L 8.59 98.74 L 8.40 98.72 L 8.30 98.60 L 8.42 98.49 L 8.54 98.58 L 8.51 98.42 L 8.75 98.58 L 8.71 98.21 L 8.90 98.02 L 9.07 98.22 L 9.36 98.17 L 9.69 98.34 L 9.36 98.84 Z\" /><path class=\"earthquake-japan-land\" d=\"M 8.59 98.34 L 8.59 98.34 Z\" /><path class=\"earthquake-japan-land\" d=\"M 10.00 98.36 L 10.00 98.36 Z\" /><path class=\"earthquake-japan-land\" d=\"M 8.70 98.43 L 8.62 98.38 L 8.61 98.35 L 8.70 98.43 Z\" /><path class=\"earthquake-japan-land\" d=\"M 9.94 98.53 L 9.76 98.48 L 9.89 98.40 L 9.94 98.53 Z\" /><path class=\"earthquake-japan-land\" d=\"M 9.65 98.45 L 9.65 98.45 Z\" /><path class=\"earthquake-japan-land\" d=\"M 10.40 98.59 L 10.41 98.46 L 10.40 98.59 Z\" /><path class=\"earthquake-japan-land\" d=\"M 10.72 98.51 L 10.72 98.51 Z\" /><path class=\"earthquake-japan-land\" d=\"M 10.05 99.00 L 9.98 98.85 L 10.14 98.89 L 10.14 98.95 L 10.05 99.00 Z\" /><path class=\"earthquake-japan-land\" d=\"M 9.68 98.98 L 9.77 98.92 L 9.70 98.98 L 9.68 98.98 Z\" /><path class=\"earthquake-japan-land\" d=\"M 9.64 99.05 L 9.64 99.05 Z\" /><path class=\"earthquake-japan-land\" d=\"M 7.77 99.13 L 7.77 99.13 Z\" /><path class=\"earthquake-japan-land\" d=\"M 8.95 99.80 L 8.76 99.73 L 9.04 99.72 L 8.95 99.80 Z\" /><path class=\"earthquake-japan-land\" d=\"M 7.72 91.90 L 7.72 91.90 Z\" /><path class=\"earthquake-japan-land\" d=\"M 7.70 91.91 L 7.70 91.91 Z\" /><path class=\"earthquake-japan-land\" d=\"M 7.71 91.91 L 7.71 91.91 Z\" /><path class=\"earthquake-japan-land\" d=\"M 7.83 92.02 L 7.83 92.02 Z\" /><path class=\"earthquake-japan-land\" d=\"M 7.53 92.11 L 7.53 92.11 Z\" /><path class=\"earthquake-japan-land\" d=\"M 24.16 88.20 L 24.16 88.20 Z\" /><path class=\"earthquake-japan-land\" d=\"M 7.53 92.11 L 7.53 92.11 Z\" /><path class=\"earthquake-japan-land\" d=\"M 12.78 91.26 L 12.78 91.26 Z\" /><path class=\"earthquake-japan-land\" d=\"M 12.78 91.26 L 12.78 91.26 Z\" /><path class=\"earthquake-japan-land\" d=\"M 12.79 91.26 L 12.79 91.26 Z\" /><path class=\"earthquake-japan-land\" d=\"M 12.80 91.26 L 12.80 91.26 Z\" /><path class=\"earthquake-japan-land\" d=\"M 12.80 91.26 L 12.80 91.26 Z\" /><path class=\"earthquake-japan-land\" d=\"M 12.80 91.25 L 12.80 91.25 Z\" /><path class=\"earthquake-japan-land\" d=\"M 12.80 91.25 L 12.80 91.25 Z\" /><path class=\"earthquake-japan-land\" d=\"M 87.72 30.99 L 87.75 30.87 L 87.72 30.99 Z\" /><path class=\"earthquake-japan-land\" d=\"M 89.35 31.28 L 89.97 31.34 L 90.31 31.21 L 90.31 31.39 L 90.75 31.59 L 91.81 31.70 L 91.88 31.84 L 92.23 31.91 L 92.31 32.18 L 92.68 32.27 L 93.03 32.80 L 93.23 32.87 L 93.04 33.09 L 93.12 33.22 L 93.00 33.46 L 92.69 33.48 L 92.89 33.78 L 92.82 34.04 L 93.10 34.29 L 92.90 34.37 L 92.89 34.58 L 92.36 35.14 L 92.40 35.54 L 92.08 36.00 L 91.39 36.11 L 91.31 37.11 L 91.49 37.23 L 91.19 37.51 L 90.59 37.57 L 90.25 37.37 L 89.96 37.46 L 89.69 37.14 L 89.05 37.26 L 88.92 37.13 L 88.41 37.06 L 88.15 36.85 L 88.28 36.21 L 88.46 36.10 L 88.36 36.01 L 88.50 35.44 L 88.93 35.49 L 89.30 35.31 L 89.49 35.03 L 89.24 34.80 L 88.53 34.58 L 88.61 34.11 L 87.70 33.83 L 88.07 33.30 L 88.81 32.72 L 89.18 32.02 L 89.35 31.28 Z\" /><path class=\"earthquake-japan-land\" d=\"M 67.64 52.95 L 68.25 52.80 L 68.37 53.27 L 68.65 53.48 L 68.54 53.60 L 68.24 53.55 L 68.11 53.82 L 67.73 54.10 L 67.70 54.20 L 68.18 54.59 L 68.00 54.96 L 68.09 55.13 L 68.43 54.98 L 69.24 55.02 L 69.28 55.37 L 69.71 55.75 L 70.06 55.80 L 69.90 56.14 L 69.68 56.18 L 69.76 56.28 L 69.63 56.34 L 69.79 56.45 L 68.99 56.82 L 68.94 57.10 L 68.76 57.10 L 68.88 56.98 L 68.80 56.89 L 67.96 56.83 L 67.23 56.60 L 66.96 56.41 L 66.97 56.19 L 66.65 56.04 L 67.00 55.82 L 66.17 55.54 L 65.72 55.08 L 65.29 55.09 L 65.42 54.95 L 65.34 54.86 L 65.57 54.73 L 65.34 54.65 L 65.87 54.40 L 65.39 54.21 L 65.58 54.00 L 65.72 54.04 L 65.62 53.93 L 66.04 53.86 L 65.71 53.69 L 65.69 53.52 L 65.50 53.47 L 65.60 53.44 L 65.31 53.35 L 65.37 53.16 L 65.77 53.30 L 66.04 53.15 L 66.47 53.18 L 66.69 53.02 L 67.64 52.95 Z\" /><path class=\"earthquake-japan-land\" d=\"M 65.22 53.22 L 65.22 53.22 Z\" /><path class=\"earthquake-japan-land\" d=\"M 65.04 53.29 L 65.13 53.21 L 65.04 53.29 Z\" /><path class=\"earthquake-japan-land\" d=\"M 65.91 53.86 L 65.91 53.86 Z\" /><path class=\"earthquake-japan-land\" d=\"M 65.51 54.05 L 65.51 54.05 Z\" /><path class=\"earthquake-japan-land\" d=\"M 65.40 54.05 L 65.40 54.05 Z\" /><path class=\"earthquake-japan-land\" d=\"M 65.61 54.48 L 65.61 54.48 Z\" /><path class=\"earthquake-japan-land\" d=\"M 69.58 54.67 L 70.03 54.51 L 70.06 54.70 L 69.88 54.70 L 69.84 54.87 L 69.51 54.89 L 69.58 54.67 Z\" /><path class=\"earthquake-japan-land\" d=\"M 65.48 54.53 L 65.48 54.53 Z\" /><path class=\"earthquake-japan-land\" d=\"M 65.46 54.54 L 65.46 54.54 Z\" /><path class=\"earthquake-japan-land\" d=\"M 65.44 54.60 L 65.44 54.60 Z\" /><path class=\"earthquake-japan-land\" d=\"M 65.37 54.78 L 65.37 54.78 Z\" /><path class=\"earthquake-japan-land\" d=\"M 69.40 54.96 L 69.51 55.07 L 69.37 55.18 L 69.30 55.01 L 69.40 54.96 Z\" /><path class=\"earthquake-japan-land\" d=\"M 65.74 55.20 L 65.74 55.20 Z\" /><path class=\"earthquake-japan-land\" d=\"M 66.58 55.68 L 66.58 55.68 Z\" /><path class=\"earthquake-japan-land\" d=\"M 66.82 55.93 L 66.82 55.93 Z\" /><path class=\"earthquake-japan-land\" d=\"M 66.83 55.97 L 66.83 55.97 Z\" /><path class=\"earthquake-japan-land\" d=\"M 69.74 56.28 L 69.74 56.28 Z\" /><path class=\"earthquake-japan-land\" d=\"M 67.44 56.62 L 67.44 56.62 Z\" /><path class=\"earthquake-japan-land\" d=\"M 67.80 56.77 L 67.80 56.77 Z\" /><path class=\"earthquake-japan-land\" d=\"M 69.16 57.05 L 69.01 56.94 L 69.31 56.94 L 69.16 57.05 Z\" /><path class=\"earthquake-japan-land\" d=\"M 69.09 57.06 L 69.09 57.06 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.16 51.35 L 37.16 51.35 Z\" /><path class=\"earthquake-japan-land\" d=\"M 36.92 52.62 L 36.82 52.57 L 36.89 52.67 L 36.75 52.79 L 36.98 52.67 L 36.86 52.87 L 36.97 52.90 L 36.82 52.98 L 36.97 53.02 L 36.82 53.01 L 36.89 53.13 L 36.76 53.20 L 36.66 53.10 L 36.77 52.84 L 36.54 53.01 L 36.55 52.78 L 36.41 52.80 L 36.44 53.00 L 36.13 52.90 L 36.38 52.85 L 36.37 52.54 L 36.56 52.43 L 36.41 52.51 L 36.37 52.42 L 36.53 52.15 L 36.72 52.12 L 36.43 52.00 L 36.60 51.60 L 36.98 51.64 L 37.24 51.33 L 37.48 51.51 L 37.32 51.57 L 37.45 51.61 L 37.39 51.74 L 37.16 51.74 L 37.39 51.84 L 37.36 52.02 L 36.84 52.49 L 36.92 52.62 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.39 51.45 L 37.39 51.45 Z\" /><path class=\"earthquake-japan-land\" d=\"M 36.32 52.60 L 36.32 52.60 Z\" /><path class=\"earthquake-japan-land\" d=\"M 36.33 52.63 L 36.33 52.63 Z\" /><path class=\"earthquake-japan-land\" d=\"M 36.34 52.65 L 36.34 52.65 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.03 52.95 L 37.03 52.95 Z\" /><path class=\"earthquake-japan-land\" d=\"M 36.98 53.03 L 36.98 52.91 L 36.98 53.03 Z\" /><path class=\"earthquake-japan-land\" d=\"M 36.69 52.95 L 36.69 52.95 Z\" /><path class=\"earthquake-japan-land\" d=\"M 36.71 52.98 L 36.71 52.98 Z\" /><path class=\"earthquake-japan-land\" d=\"M 36.67 53.00 L 36.67 53.00 Z\" /><path class=\"earthquake-japan-land\" d=\"M 36.70 53.02 L 36.70 53.02 Z\" /><path class=\"earthquake-japan-land\" d=\"M 36.66 53.16 L 36.48 53.02 L 36.62 53.02 L 36.66 53.16 Z\" /><path class=\"earthquake-japan-land\" d=\"M 36.07 54.16 L 36.06 54.03 L 35.83 54.08 L 36.02 53.04 L 36.11 53.21 L 36.40 53.15 L 36.45 53.29 L 36.33 53.06 L 36.54 53.15 L 36.52 53.29 L 36.74 53.19 L 36.58 53.35 L 36.62 53.52 L 36.44 53.64 L 36.41 53.95 L 36.07 54.16 Z\" /><path class=\"earthquake-japan-land\" d=\"M 36.98 53.13 L 36.98 53.13 Z\" /><path class=\"earthquake-japan-land\" d=\"M 36.60 53.18 L 36.60 53.18 Z\" /><path class=\"earthquake-japan-land\" d=\"M 36.80 53.31 L 36.75 53.21 L 36.96 53.18 L 36.80 53.31 Z\" /><path class=\"earthquake-japan-land\" d=\"M 36.21 54.11 L 36.21 54.11 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.44 55.18 L 38.44 55.18 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.39 55.17 L 38.39 55.17 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.49 55.16 L 38.49 55.16 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.58 55.89 L 38.21 55.60 L 38.42 55.64 L 38.25 55.42 L 38.44 55.43 L 38.36 55.28 L 38.51 55.17 L 38.86 55.26 L 38.72 55.42 L 38.99 55.51 L 38.79 55.56 L 38.99 55.63 L 38.94 55.72 L 38.66 55.74 L 38.58 55.89 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.31 55.32 L 38.31 55.32 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.22 55.67 L 38.22 55.67 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.15 55.76 L 38.15 55.76 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.32 55.72 L 39.32 55.72 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.79 55.77 L 38.79 55.77 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.14 55.81 L 38.14 55.81 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.24 55.83 L 38.24 55.83 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.12 55.92 L 38.12 55.92 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.76 56.35 L 37.76 56.35 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.76 56.96 L 37.48 56.94 L 37.77 56.77 L 37.76 56.86 L 37.91 56.84 L 37.76 56.96 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.66 57.25 L 38.78 56.96 L 38.96 57.13 L 38.66 57.25 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.63 57.04 L 38.63 57.04 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.54 57.16 L 37.72 57.08 L 37.54 57.16 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.08 57.50 L 36.98 57.45 L 37.16 57.08 L 37.08 57.50 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.67 57.18 L 37.67 57.18 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.56 57.18 L 38.56 57.18 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.42 57.25 L 38.42 57.25 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.06 57.51 L 38.98 57.21 L 39.29 57.37 L 39.06 57.51 Z\" /><path class=\"earthquake-japan-land\" d=\"M 36.87 58.32 L 36.77 58.15 L 37.00 58.27 L 36.91 58.06 L 37.17 58.01 L 37.01 57.89 L 37.23 57.77 L 37.18 57.51 L 37.49 57.47 L 37.55 57.36 L 37.62 57.48 L 37.62 57.36 L 37.75 57.36 L 37.59 57.28 L 37.76 57.23 L 37.84 57.46 L 37.57 57.59 L 37.66 57.67 L 37.42 57.80 L 37.50 57.91 L 36.87 58.32 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.90 57.30 L 38.90 57.30 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.16 57.44 L 38.36 57.27 L 38.39 57.49 L 38.95 57.41 L 38.79 57.77 L 39.07 57.99 L 39.09 58.26 L 39.71 58.34 L 39.77 58.56 L 39.61 58.68 L 40.31 59.15 L 41.01 59.28 L 40.92 59.48 L 40.46 59.73 L 40.60 59.66 L 40.64 59.81 L 40.93 59.82 L 41.46 59.64 L 41.69 59.75 L 41.89 60.10 L 41.75 60.56 L 40.84 60.95 L 40.63 60.50 L 40.85 60.49 L 41.03 60.21 L 40.90 60.03 L 40.42 60.03 L 40.11 60.19 L 39.74 60.18 L 39.46 60.63 L 39.18 60.73 L 38.91 61.04 L 38.69 61.05 L 39.08 60.66 L 38.96 60.48 L 39.18 60.51 L 39.35 60.22 L 39.09 60.36 L 39.14 60.26 L 39.02 60.26 L 38.87 59.92 L 38.68 59.98 L 38.51 59.86 L 38.17 59.43 L 38.13 59.19 L 38.30 59.09 L 38.23 58.93 L 38.38 58.64 L 38.64 58.75 L 38.63 58.88 L 38.80 58.87 L 38.69 59.14 L 38.81 58.99 L 39.10 59.16 L 39.04 59.47 L 38.92 59.33 L 38.92 59.51 L 39.05 59.57 L 38.94 59.70 L 39.23 59.86 L 39.40 59.63 L 40.04 59.79 L 39.65 59.44 L 39.75 59.16 L 39.61 58.94 L 39.36 58.80 L 39.10 58.92 L 39.18 58.82 L 38.82 58.74 L 38.84 58.63 L 38.82 58.86 L 38.64 58.64 L 38.92 58.44 L 38.66 58.53 L 38.63 58.36 L 38.50 58.35 L 38.55 58.57 L 38.32 58.63 L 38.29 58.49 L 38.49 58.44 L 38.18 58.33 L 38.28 58.25 L 38.18 58.07 L 38.13 58.23 L 38.10 58.11 L 38.00 58.16 L 38.07 58.07 L 37.77 58.11 L 37.91 57.77 L 38.11 57.68 L 37.81 57.62 L 37.84 57.38 L 38.16 57.44 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.89 57.32 L 38.89 57.32 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.02 57.36 L 38.02 57.36 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.89 57.71 L 37.89 57.71 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.59 57.97 L 35.35 57.86 L 35.67 57.72 L 35.77 57.85 L 35.59 57.97 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.86 57.78 L 37.86 57.78 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.81 57.79 L 37.81 57.79 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.86 57.83 L 37.86 57.83 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.82 57.86 L 37.82 57.86 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.82 57.90 L 37.82 57.90 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.75 57.90 L 37.75 57.90 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.79 57.91 L 37.79 57.91 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.35 57.98 L 35.33 57.90 L 35.35 57.98 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.80 57.94 L 37.80 57.94 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.81 57.95 L 37.81 57.95 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.78 57.94 L 37.78 57.94 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.32 57.94 L 35.32 57.94 Z\" /><path class=\"earthquake-japan-land\" d=\"M 36.69 57.96 L 36.69 57.96 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.77 58.06 L 37.77 58.06 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.66 58.09 L 35.66 58.09 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.34 58.10 L 35.34 58.10 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.25 58.26 L 35.14 58.18 L 35.22 58.10 L 35.48 58.11 L 35.44 58.25 L 35.25 58.26 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.84 58.13 L 37.84 58.13 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.66 58.37 L 35.61 58.12 L 35.66 58.37 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.11 58.18 L 35.11 58.18 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.88 58.15 L 37.88 58.15 Z\" /><path class=\"earthquake-japan-land\" d=\"M 36.75 58.15 L 36.75 58.15 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.95 58.17 L 37.95 58.17 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.98 58.18 L 37.98 58.18 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.99 58.22 L 37.99 58.22 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.05 58.23 L 38.05 58.23 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.89 58.20 L 37.89 58.20 Z\" /><path class=\"earthquake-japan-land\" d=\"M 36.71 58.21 L 36.71 58.21 Z\" /><path class=\"earthquake-japan-land\" d=\"M 34.65 58.23 L 34.65 58.23 Z\" /><path class=\"earthquake-japan-land\" d=\"M 34.90 58.25 L 34.90 58.25 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.91 58.36 L 37.96 58.22 L 37.91 58.36 Z\" /><path class=\"earthquake-japan-land\" d=\"M 36.67 58.26 L 36.67 58.26 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.06 58.25 L 38.06 58.25 Z\" /><path class=\"earthquake-japan-land\" d=\"M 36.73 58.28 L 36.73 58.28 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.11 58.28 L 35.11 58.28 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.26 58.29 L 35.26 58.29 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.06 58.28 L 35.06 58.28 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.11 58.34 L 35.11 58.34 Z\" /><path class=\"earthquake-japan-land\" d=\"M 34.52 58.33 L 34.52 58.33 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.17 58.31 L 35.17 58.31 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.62 58.33 L 37.62 58.33 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.37 58.38 L 38.37 58.38 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.29 59.92 L 35.19 59.51 L 35.33 59.53 L 35.13 59.46 L 35.17 59.33 L 34.96 59.34 L 35.06 59.20 L 35.24 59.29 L 35.33 59.18 L 35.21 58.96 L 35.44 58.97 L 35.37 58.84 L 35.53 58.70 L 35.57 58.35 L 35.41 59.15 L 35.82 59.05 L 35.91 59.21 L 35.69 59.38 L 35.50 59.27 L 35.49 59.73 L 35.33 59.71 L 35.29 59.92 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.19 58.37 L 38.19 58.37 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.35 58.41 L 38.35 58.41 Z\" /><path class=\"earthquake-japan-land\" d=\"M 34.49 58.41 L 34.49 58.41 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.31 58.41 L 38.31 58.41 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.68 58.49 L 37.52 58.45 L 37.72 58.40 L 37.68 58.49 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.40 58.48 L 38.40 58.48 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.27 58.46 L 38.27 58.46 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.66 58.49 L 35.66 58.49 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.32 58.49 L 38.32 58.49 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.76 58.49 L 38.76 58.49 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.92 58.79 L 38.92 58.79 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.04 58.99 L 37.96 58.88 L 38.18 58.81 L 38.04 58.99 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.84 58.80 L 37.84 58.80 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.08 58.87 L 39.08 58.87 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.16 58.97 L 38.18 58.89 L 38.16 58.97 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.81 59.09 L 37.80 58.95 L 37.95 58.99 L 37.81 59.09 Z\" /><path class=\"earthquake-japan-land\" d=\"M 36.17 59.14 L 36.30 59.00 L 36.17 59.14 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.89 59.00 L 35.89 59.00 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.18 59.02 L 37.18 59.02 Z\" /><path class=\"earthquake-japan-land\" d=\"M 36.73 59.10 L 36.77 59.00 L 36.73 59.10 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.95 59.06 L 35.87 59.03 L 35.95 59.06 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.04 59.08 L 35.16 59.03 L 35.04 59.08 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.69 59.06 L 37.69 59.06 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.24 59.14 L 38.25 59.05 L 38.24 59.14 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.77 59.09 L 37.77 59.09 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.72 59.11 L 38.72 59.11 Z\" /><path class=\"earthquake-japan-land\" d=\"M 36.81 59.08 L 36.81 59.08 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.71 59.12 L 38.71 59.12 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.12 59.20 L 35.12 59.20 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.57 59.15 L 35.57 59.15 Z\" /><path class=\"earthquake-japan-land\" d=\"M 34.91 59.34 L 34.97 59.26 L 34.91 59.34 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.07 59.28 L 39.07 59.28 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.15 59.34 L 38.15 59.34 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.05 59.47 L 37.99 59.33 L 38.12 59.39 L 38.05 59.47 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.13 59.80 L 34.83 59.67 L 34.80 59.53 L 35.01 59.65 L 34.91 59.41 L 35.16 59.57 L 35.13 59.80 Z\" /><path class=\"earthquake-japan-land\" d=\"M 34.81 59.52 L 34.65 59.46 L 34.84 59.41 L 34.81 59.52 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.59 59.53 L 39.51 59.41 L 39.59 59.53 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.94 59.47 L 35.94 59.47 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.23 59.47 L 35.23 59.47 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.03 59.48 L 39.03 59.48 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.70 59.54 L 39.70 59.54 Z\" /><path class=\"earthquake-japan-land\" d=\"M 34.73 59.56 L 34.73 59.56 Z\" /><path class=\"earthquake-japan-land\" d=\"M 34.55 59.61 L 34.55 59.61 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.19 59.61 L 35.19 59.61 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.18 59.59 L 39.18 59.59 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.99 59.64 L 37.99 59.64 Z\" /><path class=\"earthquake-japan-land\" d=\"M 34.70 60.00 L 34.36 59.72 L 34.44 59.65 L 34.65 59.84 L 34.62 59.67 L 34.69 59.78 L 34.70 59.62 L 34.73 59.63 L 34.78 59.67 L 34.70 60.00 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.17 59.69 L 35.17 59.69 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.00 59.65 L 39.00 59.65 Z\" /><path class=\"earthquake-japan-land\" d=\"M 34.53 59.66 L 34.53 59.66 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.75 59.66 L 37.75 59.66 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.65 59.69 L 39.65 59.69 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.04 59.70 L 39.04 59.70 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.22 59.71 L 35.22 59.71 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.79 59.70 L 37.79 59.70 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.16 59.73 L 35.16 59.73 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.10 59.70 L 39.10 59.70 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.22 59.72 L 35.22 59.72 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.01 59.75 L 35.01 59.75 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.19 59.80 L 35.19 59.80 Z\" /><path class=\"earthquake-japan-land\" d=\"M 34.33 60.17 L 34.16 60.01 L 34.18 59.83 L 34.38 60.00 L 34.31 59.80 L 34.55 60.01 L 34.33 60.17 Z\" /><path class=\"earthquake-japan-land\" d=\"M 33.39 59.99 L 33.39 59.99 Z\" /><path class=\"earthquake-japan-land\" d=\"M 34.75 59.96 L 34.75 59.96 Z\" /><path class=\"earthquake-japan-land\" d=\"M 34.66 60.01 L 34.66 60.01 Z\" /><path class=\"earthquake-japan-land\" d=\"M 33.86 61.03 L 33.69 60.88 L 33.26 60.95 L 32.99 60.84 L 33.05 60.70 L 33.22 60.89 L 33.33 60.78 L 33.18 60.76 L 33.38 60.58 L 33.23 60.47 L 33.20 60.18 L 33.32 60.07 L 33.48 60.15 L 33.45 60.28 L 33.68 60.20 L 33.69 60.28 L 33.78 60.14 L 33.86 60.30 L 33.98 60.20 L 33.82 60.18 L 34.04 60.01 L 34.12 60.18 L 34.02 60.22 L 34.27 60.25 L 34.19 60.39 L 34.46 60.72 L 33.84 60.71 L 33.96 60.94 L 33.86 61.03 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.78 60.05 L 38.78 60.05 Z\" /><path class=\"earthquake-japan-land\" d=\"M 34.93 60.26 L 34.81 60.23 L 34.95 60.04 L 35.03 60.21 L 34.93 60.26 Z\" /><path class=\"earthquake-japan-land\" d=\"M 34.82 60.17 L 34.82 60.17 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.92 60.24 L 39.82 60.17 L 39.92 60.24 Z\" /><path class=\"earthquake-japan-land\" d=\"M 41.86 60.18 L 41.86 60.18 Z\" /><path class=\"earthquake-japan-land\" d=\"M 40.03 60.22 L 40.03 60.22 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.98 60.21 L 39.98 60.21 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.03 60.21 L 35.03 60.21 Z\" /><path class=\"earthquake-japan-land\" d=\"M 34.21 60.22 L 34.21 60.22 Z\" /><path class=\"earthquake-japan-land\" d=\"M 34.36 60.28 L 34.36 60.28 Z\" /><path class=\"earthquake-japan-land\" d=\"M 33.86 60.29 L 33.86 60.29 Z\" /><path class=\"earthquake-japan-land\" d=\"M 32.99 60.40 L 33.03 60.27 L 32.99 60.40 Z\" /><path class=\"earthquake-japan-land\" d=\"M 34.31 60.36 L 34.31 60.36 Z\" /><path class=\"earthquake-japan-land\" d=\"M 34.27 60.37 L 34.27 60.37 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.08 60.37 L 39.08 60.37 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.89 60.50 L 38.80 60.39 L 38.89 60.50 Z\" /><path class=\"earthquake-japan-land\" d=\"M 34.48 60.48 L 34.48 60.48 Z\" /><path class=\"earthquake-japan-land\" d=\"M 33.11 60.74 L 33.16 60.55 L 33.11 60.74 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.77 60.69 L 38.77 60.69 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.68 60.79 L 38.68 60.79 Z\" /><path class=\"earthquake-japan-land\" d=\"M 33.89 60.82 L 33.89 60.82 Z\" /><path class=\"earthquake-japan-land\" d=\"M 33.89 60.84 L 33.89 60.84 Z\" /><path class=\"earthquake-japan-land\" d=\"M 34.20 60.93 L 34.20 60.93 Z\" /><path class=\"earthquake-japan-land\" d=\"M 34.60 60.95 L 34.60 60.95 Z\" /><path class=\"earthquake-japan-land\" d=\"M 34.52 60.97 L 34.52 60.97 Z\" /><path class=\"earthquake-japan-land\" d=\"M 33.54 61.01 L 33.54 61.01 Z\" /><path class=\"earthquake-japan-land\" d=\"M 34.51 61.09 L 34.51 61.09 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.87 61.14 L 38.94 61.05 L 38.87 61.14 Z\" /><path class=\"earthquake-japan-land\" d=\"M 32.02 63.47 L 31.90 63.45 L 32.02 63.47 Z\" /><path class=\"earthquake-japan-land\" d=\"M 31.89 63.50 L 31.89 63.50 Z\" /><path class=\"earthquake-japan-land\" d=\"M 31.84 63.53 L 31.84 63.53 Z\" /><path class=\"earthquake-japan-land\" d=\"M 31.81 63.60 L 31.81 63.60 Z\" /><path class=\"earthquake-japan-land\" d=\"M 31.74 63.69 L 31.77 63.60 L 31.74 63.69 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.22 51.25 L 37.22 51.25 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.14 51.28 L 37.14 51.28 Z\" /><path class=\"earthquake-japan-land\" d=\"M 34.02 58.22 L 34.02 58.22 Z\" /><path class=\"earthquake-japan-land\" d=\"M 34.02 58.26 L 34.02 58.26 Z\" /><path class=\"earthquake-japan-land\" d=\"M 30.54 62.51 L 30.54 62.51 Z\" /><path class=\"earthquake-japan-land\" d=\"M 30.52 62.52 L 30.52 62.52 Z\" /><path class=\"earthquake-japan-land\" d=\"M 30.52 62.53 L 30.52 62.53 Z\" /><path class=\"earthquake-japan-land\" d=\"M 31.97 63.37 L 31.97 63.37 Z\" /><path class=\"earthquake-japan-land\" d=\"M 31.74 63.69 L 31.74 63.69 Z\" /><path class=\"earthquake-japan-land\" d=\"M 34.01 58.25 L 34.01 58.25 Z\" /><path class=\"earthquake-japan-land\" d=\"M 34.02 58.26 L 34.02 58.26 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.41 55.13 L 38.41 55.13 Z\" /><path class=\"earthquake-japan-land\" d=\"M 94.40 24.95 L 94.31 25.27 L 94.93 25.33 L 94.97 25.66 L 94.81 25.69 L 94.71 26.24 L 94.30 26.48 L 94.41 26.75 L 94.22 26.94 L 94.23 27.39 L 94.39 27.84 L 93.92 27.88 L 93.94 28.07 L 94.24 28.20 L 93.87 28.48 L 94.11 28.69 L 94.11 28.86 L 93.65 29.24 L 93.62 29.63 L 93.42 29.74 L 93.27 30.04 L 93.52 30.26 L 93.47 30.44 L 93.59 30.58 L 93.94 30.74 L 93.83 30.92 L 94.04 31.00 L 93.75 31.18 L 93.85 31.25 L 93.76 31.42 L 94.05 31.56 L 93.82 31.82 L 93.87 32.01 L 93.27 32.32 L 92.81 32.39 L 92.31 32.18 L 92.16 31.85 L 91.88 31.84 L 91.65 31.66 L 91.56 31.75 L 91.01 31.66 L 90.98 31.54 L 90.75 31.59 L 90.31 31.39 L 90.31 31.21 L 89.97 31.34 L 89.35 31.28 L 89.58 30.56 L 89.90 30.39 L 90.13 29.91 L 90.30 29.05 L 90.25 28.30 L 89.98 27.92 L 89.60 27.72 L 89.29 27.74 L 89.25 27.89 L 88.78 27.92 L 88.47 27.29 L 89.07 27.46 L 89.44 27.26 L 89.77 26.88 L 89.93 26.36 L 90.07 26.28 L 90.13 25.73 L 89.68 25.32 L 90.10 25.36 L 90.10 25.23 L 90.34 25.14 L 90.54 25.29 L 91.68 25.27 L 91.94 25.06 L 92.64 25.31 L 92.71 25.44 L 92.95 25.29 L 93.24 25.44 L 93.67 25.38 L 93.68 25.27 L 94.02 25.23 L 94.11 25.01 L 94.40 24.95 Z\" /><path class=\"earthquake-japan-land\" d=\"M 88.49 27.21 L 88.49 27.21 Z\" /><path class=\"earthquake-japan-land\" d=\"M 90.19 28.37 L 90.08 28.31 L 90.19 28.37 Z\" /><path class=\"earthquake-japan-land\" d=\"M 87.61 30.97 L 87.61 30.97 Z\" /><path class=\"earthquake-japan-land\" d=\"M 60.07 48.41 L 60.05 48.60 L 60.69 48.73 L 60.86 49.23 L 62.00 48.88 L 61.90 49.05 L 62.06 49.15 L 62.04 49.33 L 61.83 49.34 L 61.58 49.80 L 61.34 49.90 L 61.43 50.02 L 61.27 50.25 L 61.47 50.42 L 61.27 50.68 L 61.58 50.90 L 61.61 51.26 L 61.22 51.29 L 60.93 51.17 L 60.99 51.32 L 61.22 51.36 L 60.60 51.87 L 59.73 51.82 L 60.23 51.92 L 60.01 52.07 L 60.02 52.22 L 59.80 52.16 L 59.67 52.49 L 59.17 52.39 L 59.04 52.46 L 59.11 52.59 L 58.94 52.57 L 58.69 52.16 L 58.59 52.29 L 58.68 52.32 L 58.71 52.41 L 58.52 52.37 L 58.45 52.09 L 58.42 52.24 L 58.29 52.18 L 57.70 52.45 L 57.43 52.21 L 57.63 52.48 L 57.37 52.54 L 57.45 52.46 L 57.23 52.36 L 57.23 52.02 L 56.91 51.72 L 57.01 51.49 L 56.79 51.21 L 56.89 50.89 L 56.49 50.50 L 56.61 49.97 L 56.33 49.76 L 56.44 49.56 L 57.01 49.48 L 57.04 49.16 L 57.63 49.17 L 57.53 48.96 L 57.80 48.88 L 57.98 48.43 L 58.73 48.55 L 59.15 48.87 L 59.66 48.48 L 60.07 48.41 Z\" /><path class=\"earthquake-japan-land\" d=\"M 61.60 51.35 L 61.38 51.27 L 61.73 51.32 L 61.60 51.35 Z\" /><path class=\"earthquake-japan-land\" d=\"M 61.05 51.27 L 61.05 51.27 Z\" /><path class=\"earthquake-japan-land\" d=\"M 61.31 51.33 L 61.31 51.33 Z\" /><path class=\"earthquake-japan-land\" d=\"M 61.29 51.41 L 61.29 51.41 Z\" /><path class=\"earthquake-japan-land\" d=\"M 61.44 51.38 L 61.44 51.38 Z\" /><path class=\"earthquake-japan-land\" d=\"M 61.31 51.48 L 61.21 51.46 L 61.31 51.48 Z\" /><path class=\"earthquake-japan-land\" d=\"M 61.48 51.45 L 61.48 51.45 Z\" /><path class=\"earthquake-japan-land\" d=\"M 61.12 51.51 L 61.22 51.46 L 61.12 51.51 Z\" /><path class=\"earthquake-japan-land\" d=\"M 60.84 51.81 L 61.00 51.74 L 60.84 51.81 Z\" /><path class=\"earthquake-japan-land\" d=\"M 61.00 51.78 L 61.00 51.78 Z\" /><path class=\"earthquake-japan-land\" d=\"M 59.93 51.80 L 59.93 51.80 Z\" /><path class=\"earthquake-japan-land\" d=\"M 60.97 51.84 L 60.97 51.84 Z\" /><path class=\"earthquake-japan-land\" d=\"M 60.79 51.83 L 60.79 51.83 Z\" /><path class=\"earthquake-japan-land\" d=\"M 60.49 52.00 L 60.49 52.00 Z\" /><path class=\"earthquake-japan-land\" d=\"M 60.54 52.00 L 60.54 52.00 Z\" /><path class=\"earthquake-japan-land\" d=\"M 60.12 52.24 L 60.03 52.28 L 60.12 52.24 Z\" /><path class=\"earthquake-japan-land\" d=\"M 58.56 52.45 L 58.56 52.45 Z\" /><path class=\"earthquake-japan-land\" d=\"M 58.73 52.48 L 58.73 52.48 Z\" /><path class=\"earthquake-japan-land\" d=\"M 59.27 52.52 L 59.27 52.52 Z\" /><path class=\"earthquake-japan-land\" d=\"M 57.49 52.59 L 57.49 52.59 Z\" /><path class=\"earthquake-japan-land\" d=\"M 57.50 52.62 L 57.58 52.57 L 57.50 52.62 Z\" /><path class=\"earthquake-japan-land\" d=\"M 58.85 52.64 L 58.85 52.64 Z\" /><path class=\"earthquake-japan-land\" d=\"M 59.07 52.61 L 59.07 52.61 Z\" /><path class=\"earthquake-japan-land\" d=\"M 59.16 52.65 L 59.16 52.65 Z\" /><path class=\"earthquake-japan-land\" d=\"M 59.60 52.64 L 59.60 52.64 Z\" /><path class=\"earthquake-japan-land\" d=\"M 57.56 52.77 L 57.63 52.65 L 57.56 52.77 Z\" /><path class=\"earthquake-japan-land\" d=\"M 57.73 52.88 L 57.58 52.80 L 57.69 52.72 L 57.73 52.88 Z\" /><path class=\"earthquake-japan-land\" d=\"M 57.48 52.81 L 57.48 52.81 Z\" /><path class=\"earthquake-japan-land\" d=\"M 57.93 52.83 L 57.93 52.83 Z\" /><path class=\"earthquake-japan-land\" d=\"M 57.87 52.96 L 57.94 52.90 L 57.87 52.96 Z\" /><path class=\"earthquake-japan-land\" d=\"M 57.61 52.99 L 57.61 52.99 Z\" /><path class=\"earthquake-japan-land\" d=\"M 57.54 53.02 L 57.49 52.95 L 57.54 53.02 Z\" /><path class=\"earthquake-japan-land\" d=\"M 57.67 53.19 L 57.67 53.19 Z\" /><path class=\"earthquake-japan-land\" d=\"M 40.52 53.46 L 40.52 53.46 Z\" /><path class=\"earthquake-japan-land\" d=\"M 43.64 54.51 L 43.64 54.51 Z\" /><path class=\"earthquake-japan-land\" d=\"M 43.58 54.54 L 43.58 54.54 Z\" /><path class=\"earthquake-japan-land\" d=\"M 44.04 54.53 L 44.04 54.53 Z\" /><path class=\"earthquake-japan-land\" d=\"M 44.10 54.61 L 44.04 54.55 L 44.10 54.61 Z\" /><path class=\"earthquake-japan-land\" d=\"M 44.28 54.70 L 44.28 54.70 Z\" /><path class=\"earthquake-japan-land\" d=\"M 43.36 54.92 L 43.85 54.79 L 43.75 54.90 L 44.03 54.86 L 44.07 54.98 L 43.70 55.11 L 43.99 55.12 L 44.12 54.91 L 44.28 54.87 L 44.24 54.98 L 44.36 54.93 L 44.32 55.02 L 44.46 55.06 L 44.81 54.72 L 45.10 54.71 L 44.96 55.22 L 44.78 55.32 L 45.00 55.38 L 44.91 55.53 L 45.05 55.56 L 45.02 55.68 L 45.47 56.26 L 45.92 56.29 L 45.88 56.78 L 45.15 56.73 L 44.47 57.06 L 44.43 57.36 L 44.17 57.53 L 44.34 57.88 L 44.13 58.01 L 44.43 58.24 L 44.26 58.59 L 43.40 58.31 L 43.29 58.59 L 42.90 58.57 L 42.48 58.85 L 42.53 59.08 L 41.98 59.09 L 42.12 58.85 L 41.69 58.17 L 42.15 57.76 L 42.24 57.89 L 42.40 57.59 L 42.68 57.53 L 42.68 57.10 L 42.48 57.07 L 42.05 57.30 L 41.98 57.15 L 41.38 56.92 L 40.22 56.97 L 40.22 56.84 L 40.76 56.65 L 40.82 56.54 L 40.58 56.61 L 40.66 56.51 L 40.44 56.44 L 40.73 56.39 L 41.04 56.06 L 41.36 56.44 L 41.99 56.36 L 42.14 55.97 L 41.78 56.17 L 41.45 55.97 L 41.61 56.09 L 41.98 55.98 L 42.33 55.67 L 42.22 55.39 L 42.36 55.37 L 42.38 55.19 L 42.58 55.18 L 42.62 55.05 L 43.17 55.07 L 43.36 54.92 Z\" /><path class=\"earthquake-japan-land\" d=\"M 44.11 54.86 L 43.89 54.79 L 44.22 54.82 L 44.11 54.86 Z\" /><path class=\"earthquake-japan-land\" d=\"M 42.13 55.06 L 42.04 54.95 L 42.23 54.93 L 42.13 55.06 Z\" /><path class=\"earthquake-japan-land\" d=\"M 42.51 55.02 L 42.44 54.94 L 42.51 55.02 Z\" /><path class=\"earthquake-japan-land\" d=\"M 40.18 55.17 L 40.18 55.17 Z\" /><path class=\"earthquake-japan-land\" d=\"M 42.34 55.18 L 42.34 55.18 Z\" /><path class=\"earthquake-japan-land\" d=\"M 45.16 55.37 L 45.17 55.19 L 45.16 55.37 Z\" /><path class=\"earthquake-japan-land\" d=\"M 44.88 55.33 L 44.88 55.33 Z\" /><path class=\"earthquake-japan-land\" d=\"M 45.04 55.33 L 45.04 55.33 Z\" /><path class=\"earthquake-japan-land\" d=\"M 45.05 55.50 L 45.05 55.50 Z\" /><path class=\"earthquake-japan-land\" d=\"M 41.82 55.66 L 41.82 55.66 Z\" /><path class=\"earthquake-japan-land\" d=\"M 41.17 55.99 L 41.17 55.99 Z\" /><path class=\"earthquake-japan-land\" d=\"M 42.03 56.10 L 42.13 56.04 L 42.03 56.10 Z\" /><path class=\"earthquake-japan-land\" d=\"M 41.51 56.33 L 41.50 56.19 L 41.51 56.33 Z\" /><path class=\"earthquake-japan-land\" d=\"M 40.25 56.52 L 40.25 56.52 Z\" /><path class=\"earthquake-japan-land\" d=\"M 75.29 43.76 L 75.80 43.38 L 76.03 43.51 L 76.23 43.36 L 76.54 43.35 L 76.57 43.52 L 76.95 43.37 L 77.03 43.52 L 77.56 43.53 L 78.23 43.90 L 78.23 44.14 L 77.87 44.45 L 77.97 44.67 L 77.77 44.82 L 77.75 44.96 L 78.07 45.11 L 77.97 45.39 L 77.38 45.94 L 76.90 45.95 L 76.63 46.29 L 77.29 46.54 L 77.72 47.05 L 77.57 47.24 L 77.85 47.35 L 77.87 47.53 L 78.16 47.69 L 78.16 47.86 L 77.97 47.97 L 78.17 48.19 L 77.87 48.18 L 78.02 48.48 L 77.78 48.59 L 77.81 48.71 L 77.15 48.99 L 76.54 48.68 L 75.93 48.85 L 75.83 48.72 L 75.41 48.67 L 75.24 48.34 L 74.89 48.16 L 74.96 48.07 L 74.17 48.38 L 73.85 48.32 L 73.39 48.90 L 73.35 49.39 L 73.23 49.25 L 73.22 49.27 L 73.23 49.34 L 73.08 49.32 L 72.67 48.83 L 72.06 49.01 L 71.89 48.90 L 72.07 48.31 L 72.22 48.23 L 71.94 47.78 L 72.03 47.67 L 71.86 47.46 L 71.59 47.51 L 71.62 47.20 L 71.44 47.18 L 71.38 47.03 L 71.62 46.74 L 71.61 46.52 L 71.89 46.39 L 72.53 46.59 L 72.62 46.42 L 73.95 46.37 L 74.16 46.10 L 74.11 45.93 L 73.63 45.47 L 73.67 45.23 L 73.82 45.15 L 73.83 44.72 L 74.26 44.33 L 73.96 44.09 L 74.16 44.06 L 74.36 43.78 L 74.37 43.90 L 74.73 43.88 L 74.88 44.21 L 75.26 43.95 L 75.29 43.76 Z\" /><path class=\"earthquake-japan-land\" d=\"M 94.56 20.22 L 94.56 20.22 Z\" /><path class=\"earthquake-japan-land\" d=\"M 93.89 21.77 L 94.18 20.84 L 94.54 20.48 L 94.56 20.24 L 95.02 20.52 L 95.57 20.62 L 96.33 21.11 L 96.86 21.04 L 97.32 20.77 L 96.95 21.96 L 96.93 23.04 L 97.08 23.85 L 97.44 24.74 L 97.67 24.87 L 97.88 24.80 L 98.42 25.22 L 97.94 25.42 L 97.69 25.69 L 97.22 25.56 L 96.76 25.77 L 96.59 25.58 L 95.03 26.28 L 94.73 26.10 L 94.81 25.69 L 94.97 25.66 L 94.93 25.33 L 94.31 25.27 L 94.40 24.95 L 94.11 25.01 L 94.02 25.23 L 93.68 25.27 L 93.67 25.38 L 93.24 25.44 L 92.95 25.29 L 92.71 25.44 L 92.64 25.31 L 91.94 25.06 L 91.68 25.27 L 90.54 25.29 L 90.34 25.14 L 90.10 25.23 L 90.10 25.36 L 89.68 25.32 L 89.71 24.78 L 89.30 24.48 L 89.64 24.35 L 90.00 23.89 L 90.26 23.78 L 90.61 23.90 L 91.26 23.63 L 91.62 22.52 L 91.61 22.33 L 91.60 22.30 L 91.24 22.12 L 91.60 22.06 L 91.70 21.54 L 92.32 21.90 L 92.75 21.68 L 93.15 21.85 L 93.30 22.96 L 93.43 23.32 L 93.66 23.49 L 93.98 23.47 L 94.29 23.24 L 94.36 22.97 L 94.19 22.94 L 94.40 22.68 L 94.74 22.76 L 94.92 22.91 L 94.87 23.03 L 95.32 23.12 L 95.53 23.31 L 96.00 23.04 L 96.39 22.02 L 95.94 21.46 L 95.28 21.89 L 94.91 21.82 L 94.06 22.14 L 93.83 22.07 L 93.89 21.77 Z\" /><path class=\"earthquake-japan-land\" d=\"M 94.39 22.67 L 94.39 22.67 Z\" /><path class=\"earthquake-japan-land\" d=\"M 94.28 23.04 L 94.28 23.04 Z\" /><path class=\"earthquake-japan-land\" d=\"M 87.49 24.84 L 87.49 24.84 Z\" /><path class=\"earthquake-japan-land\" d=\"M 66.85 49.79 L 66.91 49.95 L 67.46 50.05 L 67.41 50.23 L 67.71 50.38 L 67.90 50.35 L 67.78 50.28 L 67.87 50.13 L 68.06 50.13 L 68.00 50.33 L 68.21 50.32 L 68.72 50.89 L 68.55 50.99 L 68.25 51.78 L 68.41 51.89 L 68.25 52.07 L 68.38 52.16 L 68.40 52.69 L 67.54 53.02 L 67.43 52.90 L 65.56 53.31 L 65.47 53.12 L 66.09 52.98 L 66.88 52.39 L 66.89 52.13 L 66.95 52.25 L 67.16 52.13 L 67.23 52.01 L 67.05 52.00 L 67.01 51.82 L 67.10 51.96 L 67.33 51.89 L 67.13 51.85 L 67.25 51.61 L 67.07 51.58 L 67.12 51.39 L 67.01 51.39 L 67.30 51.21 L 67.08 50.82 L 67.22 50.46 L 67.09 50.41 L 67.33 50.32 L 66.73 50.16 L 66.77 49.89 L 66.65 49.84 L 66.85 49.79 Z\" /><path class=\"earthquake-japan-land\" d=\"M 67.05 51.55 L 66.94 51.51 L 67.05 51.55 Z\" /><path class=\"earthquake-japan-land\" d=\"M 66.96 51.63 L 66.90 51.55 L 66.96 51.63 Z\" /><path class=\"earthquake-japan-land\" d=\"M 67.11 51.72 L 66.99 51.64 L 67.20 51.63 L 67.11 51.72 Z\" /><path class=\"earthquake-japan-land\" d=\"M 67.09 51.77 L 67.00 51.72 L 67.09 51.77 Z\" /><path class=\"earthquake-japan-land\" d=\"M 67.13 52.06 L 67.11 52.16 L 67.00 52.11 L 67.13 52.06 Z\" /><path class=\"earthquake-japan-land\" d=\"M 66.97 52.13 L 66.97 52.13 Z\" /><path class=\"earthquake-japan-land\" d=\"M 66.67 52.52 L 66.70 52.43 L 66.67 52.52 Z\" /><path class=\"earthquake-japan-land\" d=\"M 66.15 52.52 L 66.32 52.56 L 66.14 52.67 L 66.01 52.60 L 66.15 52.52 Z\" /><path class=\"earthquake-japan-land\" d=\"M 82.62 40.77 L 82.93 40.97 L 82.95 41.30 L 83.45 41.56 L 83.35 41.93 L 83.48 42.10 L 82.72 42.25 L 82.57 42.32 L 82.63 42.49 L 82.29 42.58 L 82.02 43.09 L 82.00 43.48 L 82.30 43.62 L 83.24 43.60 L 83.27 44.08 L 83.00 44.19 L 83.18 44.66 L 82.89 44.69 L 83.23 44.91 L 83.16 45.33 L 83.56 45.52 L 83.64 45.87 L 83.38 46.05 L 83.11 46.04 L 82.95 45.82 L 82.27 45.91 L 82.24 45.70 L 81.85 45.58 L 81.42 46.09 L 81.19 45.99 L 80.93 46.39 L 81.18 46.56 L 80.90 46.76 L 81.09 47.07 L 80.95 47.37 L 80.71 47.48 L 80.80 47.86 L 80.60 47.96 L 80.71 48.32 L 79.48 48.83 L 79.36 49.01 L 78.88 49.08 L 78.41 48.93 L 77.89 49.10 L 77.73 48.85 L 77.85 48.72 L 77.78 48.59 L 78.02 48.47 L 77.87 48.18 L 78.17 48.17 L 77.97 47.97 L 78.16 47.86 L 78.16 47.69 L 77.87 47.53 L 77.85 47.35 L 77.57 47.24 L 77.72 47.05 L 77.29 46.54 L 76.63 46.29 L 76.90 45.95 L 77.38 45.94 L 77.97 45.39 L 78.07 45.11 L 77.75 44.96 L 77.77 44.82 L 77.97 44.67 L 77.87 44.45 L 78.26 44.07 L 77.94 43.68 L 78.35 43.13 L 78.53 43.10 L 78.44 42.90 L 78.75 42.77 L 78.76 42.03 L 79.38 41.51 L 79.34 41.29 L 80.07 41.35 L 80.16 41.46 L 80.02 41.70 L 80.26 41.82 L 80.58 41.59 L 81.07 41.50 L 81.44 41.60 L 81.49 41.30 L 81.72 41.27 L 81.97 40.92 L 82.62 40.77 Z\" /><path class=\"earthquake-japan-land\" d=\"M 48.16 55.83 L 48.50 55.77 L 48.16 55.83 Z\" /><path class=\"earthquake-japan-land\" d=\"M 47.72 56.01 L 48.18 55.99 L 48.46 56.18 L 48.70 56.54 L 48.69 56.98 L 48.51 57.24 L 48.14 57.18 L 48.24 57.34 L 47.96 57.51 L 47.49 57.45 L 47.56 57.87 L 47.94 57.97 L 48.45 57.82 L 48.79 58.00 L 49.51 57.87 L 48.99 58.51 L 49.50 58.48 L 49.26 58.69 L 49.56 58.79 L 49.70 58.65 L 49.86 58.81 L 50.01 58.65 L 50.07 58.83 L 49.64 58.85 L 49.45 59.13 L 49.79 59.34 L 50.01 59.28 L 50.01 59.40 L 50.16 59.30 L 50.42 59.40 L 50.14 59.38 L 50.04 59.52 L 49.88 59.44 L 49.93 59.60 L 50.07 59.59 L 49.71 59.84 L 50.04 59.87 L 49.86 60.04 L 49.45 59.98 L 49.36 60.27 L 49.22 60.24 L 49.29 59.90 L 48.84 59.83 L 48.68 59.85 L 48.54 60.13 L 47.83 60.21 L 47.57 60.14 L 47.58 60.00 L 47.37 59.83 L 46.79 59.98 L 46.32 59.64 L 46.31 59.20 L 45.87 58.71 L 45.80 58.45 L 45.49 58.24 L 44.96 58.26 L 44.89 58.45 L 45.12 58.69 L 44.94 58.98 L 44.20 58.63 L 44.43 58.24 L 44.13 58.01 L 44.34 57.88 L 44.17 57.53 L 44.43 57.36 L 44.63 56.92 L 45.15 56.73 L 45.88 56.78 L 45.92 56.29 L 46.44 56.46 L 47.15 56.48 L 47.49 56.05 L 47.72 56.01 Z\" /><path class=\"earthquake-japan-land\" d=\"M 49.73 57.86 L 49.73 57.86 Z\" /><path class=\"earthquake-japan-land\" d=\"M 48.71 57.92 L 48.71 57.92 Z\" /><path class=\"earthquake-japan-land\" d=\"M 49.47 58.02 L 49.47 58.02 Z\" /><path class=\"earthquake-japan-land\" d=\"M 49.19 58.29 L 49.19 58.29 Z\" /><path class=\"earthquake-japan-land\" d=\"M 49.90 58.35 L 49.90 58.35 Z\" /><path class=\"earthquake-japan-land\" d=\"M 49.87 58.38 L 49.87 58.38 Z\" /><path class=\"earthquake-japan-land\" d=\"M 49.30 58.46 L 49.30 58.46 Z\" /><path class=\"earthquake-japan-land\" d=\"M 50.02 58.65 L 50.02 58.65 Z\" /><path class=\"earthquake-japan-land\" d=\"M 49.46 58.63 L 49.46 58.63 Z\" /><path class=\"earthquake-japan-land\" d=\"M 49.62 59.18 L 49.60 59.03 L 49.71 59.02 L 49.62 59.18 Z\" /><path class=\"earthquake-japan-land\" d=\"M 49.56 59.06 L 49.56 59.06 Z\" /><path class=\"earthquake-japan-land\" d=\"M 50.36 59.30 L 50.37 59.20 L 50.36 59.30 Z\" /><path class=\"earthquake-japan-land\" d=\"M 49.77 59.25 L 49.77 59.25 Z\" /><path class=\"earthquake-japan-land\" d=\"M 50.24 59.48 L 50.24 59.48 Z\" /><path class=\"earthquake-japan-land\" d=\"M 50.11 59.60 L 50.11 59.60 Z\" /><path class=\"earthquake-japan-land\" d=\"M 50.15 59.64 L 50.15 59.64 Z\" /><path class=\"earthquake-japan-land\" d=\"M 49.56 60.14 L 49.56 60.14 Z\" /><path class=\"earthquake-japan-land\" d=\"M 49.62 60.39 L 49.62 60.39 Z\" /><path class=\"earthquake-japan-land\" d=\"M 72.64 48.83 L 73.08 49.32 L 73.23 49.34 L 73.22 49.27 L 73.23 49.25 L 73.73 49.63 L 73.86 49.89 L 73.75 49.83 L 73.26 50.03 L 73.17 50.23 L 73.33 50.29 L 72.67 51.12 L 72.62 51.46 L 72.79 51.49 L 72.64 51.77 L 73.21 51.86 L 74.08 52.34 L 74.15 52.24 L 74.24 52.40 L 74.39 52.39 L 74.38 52.60 L 74.62 52.52 L 74.56 52.84 L 74.44 52.76 L 74.07 52.87 L 74.32 52.89 L 74.33 52.99 L 74.54 52.88 L 74.39 53.02 L 74.50 53.29 L 74.24 53.42 L 73.83 53.36 L 73.76 53.31 L 74.18 53.37 L 74.31 53.32 L 74.17 53.22 L 74.33 53.24 L 74.03 53.06 L 73.96 53.24 L 73.81 53.11 L 73.82 53.22 L 73.43 53.25 L 73.64 52.99 L 73.46 52.96 L 73.41 53.07 L 73.45 52.98 L 73.30 52.98 L 73.36 53.07 L 73.19 53.14 L 73.38 53.11 L 73.02 53.37 L 72.86 53.30 L 72.95 53.21 L 72.74 53.27 L 72.74 53.41 L 72.70 53.28 L 72.63 53.37 L 72.52 53.28 L 72.59 53.46 L 72.50 53.37 L 72.42 53.46 L 72.54 53.50 L 72.41 53.55 L 72.33 53.38 L 72.20 53.42 L 72.26 53.55 L 71.61 53.65 L 71.66 53.73 L 71.39 53.81 L 71.43 54.01 L 71.58 54.02 L 71.49 54.15 L 71.25 54.12 L 71.34 53.96 L 71.01 54.20 L 71.41 54.46 L 71.21 54.48 L 71.36 54.52 L 71.36 54.67 L 71.05 54.55 L 70.96 54.67 L 71.15 54.79 L 70.90 54.83 L 70.99 54.91 L 70.90 54.94 L 70.74 54.87 L 70.74 55.01 L 70.59 55.01 L 70.33 55.27 L 70.06 55.80 L 69.83 55.80 L 69.28 55.37 L 69.27 55.18 L 69.48 55.14 L 69.47 54.91 L 69.84 54.87 L 69.88 54.70 L 70.06 54.70 L 69.98 54.54 L 70.09 54.38 L 70.52 54.43 L 70.57 53.82 L 70.47 53.66 L 70.66 53.40 L 70.47 53.18 L 70.65 53.11 L 70.34 52.76 L 70.48 52.57 L 71.03 52.51 L 71.15 52.30 L 71.08 52.15 L 70.84 52.18 L 70.78 52.01 L 70.57 52.06 L 70.25 51.91 L 70.36 51.65 L 70.20 51.53 L 70.43 51.47 L 70.10 50.96 L 70.45 50.85 L 70.63 50.63 L 70.43 50.56 L 70.55 50.45 L 71.25 50.65 L 71.83 50.43 L 72.21 49.70 L 72.27 49.27 L 72.04 49.15 L 72.07 49.01 L 72.64 48.83 Z\" /><path class=\"earthquake-japan-land\" d=\"M 73.33 50.12 L 73.37 49.99 L 73.33 50.12 Z\" /><path class=\"earthquake-japan-land\" d=\"M 74.91 52.09 L 74.91 52.09 Z\" /><path class=\"earthquake-japan-land\" d=\"M 74.55 52.09 L 74.55 52.09 Z\" /><path class=\"earthquake-japan-land\" d=\"M 74.29 52.25 L 74.50 52.10 L 74.29 52.25 Z\" /><path class=\"earthquake-japan-land\" d=\"M 74.26 52.18 L 74.26 52.18 Z\" /><path class=\"earthquake-japan-land\" d=\"M 74.20 52.20 L 74.20 52.20 Z\" /><path class=\"earthquake-japan-land\" d=\"M 74.18 52.26 L 74.18 52.26 Z\" /><path class=\"earthquake-japan-land\" d=\"M 74.43 52.38 L 74.38 52.31 L 74.54 52.26 L 74.43 52.38 Z\" /><path class=\"earthquake-japan-land\" d=\"M 74.28 52.35 L 74.28 52.35 Z\" /><path class=\"earthquake-japan-land\" d=\"M 74.48 52.47 L 74.48 52.47 Z\" /><path class=\"earthquake-japan-land\" d=\"M 74.44 52.50 L 74.44 52.50 Z\" /><path class=\"earthquake-japan-land\" d=\"M 74.37 52.92 L 74.37 52.92 Z\" /><path class=\"earthquake-japan-land\" d=\"M 73.57 53.03 L 73.57 53.03 Z\" /><path class=\"earthquake-japan-land\" d=\"M 74.08 53.16 L 74.08 53.16 Z\" /><path class=\"earthquake-japan-land\" d=\"M 74.10 53.19 L 74.10 53.19 Z\" /><path class=\"earthquake-japan-land\" d=\"M 74.06 53.19 L 74.06 53.19 Z\" /><path class=\"earthquake-japan-land\" d=\"M 73.40 53.20 L 73.40 53.20 Z\" /><path class=\"earthquake-japan-land\" d=\"M 74.12 53.20 L 74.12 53.20 Z\" /><path class=\"earthquake-japan-land\" d=\"M 74.08 53.20 L 74.08 53.20 Z\" /><path class=\"earthquake-japan-land\" d=\"M 74.11 53.24 L 74.11 53.24 Z\" /><path class=\"earthquake-japan-land\" d=\"M 74.06 53.24 L 74.06 53.24 Z\" /><path class=\"earthquake-japan-land\" d=\"M 74.13 53.25 L 74.13 53.25 Z\" /><path class=\"earthquake-japan-land\" d=\"M 74.20 53.33 L 74.20 53.33 Z\" /><path class=\"earthquake-japan-land\" d=\"M 72.74 53.44 L 72.74 53.44 Z\" /><path class=\"earthquake-japan-land\" d=\"M 71.90 53.67 L 71.90 53.67 Z\" /><path class=\"earthquake-japan-land\" d=\"M 72.01 53.67 L 72.01 53.67 Z\" /><path class=\"earthquake-japan-land\" d=\"M 72.00 53.68 L 72.00 53.68 Z\" /><path class=\"earthquake-japan-land\" d=\"M 71.90 53.71 L 71.90 53.71 Z\" /><path class=\"earthquake-japan-land\" d=\"M 71.62 53.80 L 71.62 53.80 Z\" /><path class=\"earthquake-japan-land\" d=\"M 71.52 53.77 L 71.52 53.77 Z\" /><path class=\"earthquake-japan-land\" d=\"M 71.50 53.83 L 71.50 53.83 Z\" /><path class=\"earthquake-japan-land\" d=\"M 71.83 53.87 L 71.83 53.87 Z\" /><path class=\"earthquake-japan-land\" d=\"M 71.28 54.23 L 71.28 54.23 Z\" /><path class=\"earthquake-japan-land\" d=\"M 71.31 54.28 L 71.31 54.28 Z\" /><path class=\"earthquake-japan-land\" d=\"M 54.29 49.58 L 56.25 49.65 L 56.61 49.97 L 56.47 50.44 L 56.89 50.89 L 56.79 51.21 L 57.01 51.49 L 56.91 51.72 L 57.26 52.11 L 57.22 52.52 L 57.04 52.37 L 57.15 52.62 L 57.06 52.56 L 57.02 52.57 L 56.91 52.81 L 56.73 52.88 L 56.41 52.72 L 56.22 52.77 L 56.36 52.67 L 56.28 52.54 L 56.17 52.67 L 55.42 52.75 L 55.36 52.99 L 54.56 53.02 L 54.23 53.22 L 53.98 53.13 L 53.94 53.28 L 53.77 53.26 L 53.80 53.45 L 53.21 53.63 L 52.98 53.50 L 52.69 53.66 L 52.78 53.45 L 52.57 53.38 L 52.46 53.02 L 52.58 52.89 L 51.70 52.94 L 51.16 53.38 L 51.10 53.48 L 51.22 53.59 L 50.98 53.62 L 51.02 53.51 L 50.72 53.47 L 50.63 53.03 L 50.35 52.93 L 50.40 52.54 L 50.18 52.26 L 50.63 51.90 L 50.58 51.76 L 50.81 51.44 L 50.65 51.33 L 51.11 51.14 L 51.20 50.88 L 51.49 51.01 L 51.58 50.90 L 51.98 51.00 L 52.17 50.82 L 52.69 50.93 L 53.08 50.71 L 53.49 50.71 L 53.50 50.54 L 53.17 50.43 L 53.42 50.22 L 53.73 50.18 L 54.29 49.58 Z\" /><path class=\"earthquake-japan-land\" d=\"M 56.06 52.92 L 55.86 52.76 L 56.18 52.70 L 56.06 52.92 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.85 52.85 L 55.76 52.79 L 55.85 52.85 Z\" /><path class=\"earthquake-japan-land\" d=\"M 56.99 52.83 L 56.99 52.83 Z\" /><path class=\"earthquake-japan-land\" d=\"M 56.35 52.90 L 56.30 52.80 L 56.35 52.90 Z\" /><path class=\"earthquake-japan-land\" d=\"M 56.21 52.86 L 56.21 52.86 Z\" /><path class=\"earthquake-japan-land\" d=\"M 56.51 52.99 L 56.50 52.88 L 56.70 52.87 L 56.51 52.99 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.68 52.91 L 55.68 52.91 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.49 52.91 L 55.49 52.91 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.56 53.10 L 55.47 53.04 L 55.58 52.91 L 55.56 53.10 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.96 53.30 L 55.67 53.05 L 55.75 52.92 L 56.04 53.09 L 55.96 53.30 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.71 52.95 L 55.71 52.95 Z\" /><path class=\"earthquake-japan-land\" d=\"M 56.31 53.03 L 56.44 52.92 L 56.31 53.03 Z\" /><path class=\"earthquake-japan-land\" d=\"M 57.33 52.94 L 57.33 52.94 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.31 53.00 L 52.31 53.00 Z\" /><path class=\"earthquake-japan-land\" d=\"M 57.23 53.02 L 57.15 52.97 L 57.23 53.02 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.40 53.04 L 52.40 53.04 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.39 53.17 L 55.38 53.03 L 55.39 53.17 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.16 53.19 L 52.07 53.17 L 52.21 53.06 L 52.16 53.19 Z\" /><path class=\"earthquake-japan-land\" d=\"M 54.74 53.14 L 54.71 53.10 L 54.68 53.07 L 54.74 53.14 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.32 53.13 L 52.32 53.13 Z\" /><path class=\"earthquake-japan-land\" d=\"M 57.31 53.14 L 57.31 53.14 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.41 53.38 L 55.42 53.15 L 55.70 53.11 L 55.72 53.25 L 55.41 53.38 Z\" /><path class=\"earthquake-japan-land\" d=\"M 54.97 53.17 L 54.97 53.17 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.37 53.49 L 51.32 53.38 L 51.66 53.13 L 51.73 53.27 L 51.37 53.49 Z\" /><path class=\"earthquake-japan-land\" d=\"M 54.58 53.27 L 54.57 53.18 L 54.58 53.27 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.14 53.96 L 52.28 53.75 L 52.19 53.66 L 52.14 53.76 L 51.86 53.37 L 52.11 53.38 L 52.36 53.60 L 52.34 53.43 L 52.16 53.39 L 52.17 53.25 L 52.39 53.20 L 52.45 53.90 L 52.14 53.96 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.81 53.23 L 51.81 53.23 Z\" /><path class=\"earthquake-japan-land\" d=\"M 54.07 53.24 L 54.07 53.24 Z\" /><path class=\"earthquake-japan-land\" d=\"M 54.42 53.29 L 54.42 53.29 Z\" /><path class=\"earthquake-japan-land\" d=\"M 54.69 53.26 L 54.69 53.26 Z\" /><path class=\"earthquake-japan-land\" d=\"M 54.40 53.61 L 54.19 53.45 L 54.71 53.29 L 54.60 53.57 L 54.40 53.61 Z\" /><path class=\"earthquake-japan-land\" d=\"M 54.01 53.32 L 54.01 53.32 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.82 53.30 L 51.82 53.30 Z\" /><path class=\"earthquake-japan-land\" d=\"M 54.53 53.31 L 54.53 53.31 Z\" /><path class=\"earthquake-japan-land\" d=\"M 54.44 53.32 L 54.44 53.32 Z\" /><path class=\"earthquake-japan-land\" d=\"M 54.38 53.39 L 54.38 53.39 Z\" /><path class=\"earthquake-japan-land\" d=\"M 53.85 53.34 L 53.85 53.34 Z\" /><path class=\"earthquake-japan-land\" d=\"M 53.92 53.38 L 53.92 53.38 Z\" /><path class=\"earthquake-japan-land\" d=\"M 53.89 53.37 L 53.89 53.37 Z\" /><path class=\"earthquake-japan-land\" d=\"M 54.31 53.40 L 54.31 53.40 Z\" /><path class=\"earthquake-japan-land\" d=\"M 54.33 53.39 L 54.33 53.39 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.79 53.47 L 51.79 53.47 Z\" /><path class=\"earthquake-japan-land\" d=\"M 53.47 53.56 L 53.47 53.56 Z\" /><path class=\"earthquake-japan-land\" d=\"M 53.69 53.83 L 53.43 53.65 L 53.79 53.67 L 53.69 53.83 Z\" /><path class=\"earthquake-japan-land\" d=\"M 53.31 53.77 L 53.24 53.70 L 53.38 53.62 L 53.31 53.77 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.59 53.66 L 51.59 53.66 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.75 54.19 L 52.67 54.08 L 52.24 54.12 L 52.52 53.94 L 52.48 53.77 L 52.63 53.64 L 52.78 53.73 L 52.60 53.84 L 52.79 53.86 L 52.70 54.06 L 52.96 54.02 L 52.75 54.19 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.55 53.67 L 52.55 53.67 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.51 53.71 L 51.59 53.68 L 51.51 53.71 Z\" /><path class=\"earthquake-japan-land\" d=\"M 54.05 53.70 L 54.05 53.70 Z\" /><path class=\"earthquake-japan-land\" d=\"M 54.10 53.86 L 54.05 53.73 L 54.33 53.73 L 54.10 53.86 Z\" /><path class=\"earthquake-japan-land\" d=\"M 54.28 53.68 L 54.28 53.68 Z\" /><path class=\"earthquake-japan-land\" d=\"M 53.86 53.81 L 53.93 53.69 L 53.86 53.81 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.99 53.88 L 51.92 53.74 L 52.06 53.78 L 51.99 53.88 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.86 53.84 L 52.86 53.84 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.15 53.88 L 52.15 53.88 Z\" /><path class=\"earthquake-japan-land\" d=\"M 53.35 53.86 L 53.35 53.86 Z\" /><path class=\"earthquake-japan-land\" d=\"M 53.26 53.86 L 53.26 53.86 Z\" /><path class=\"earthquake-japan-land\" d=\"M 53.80 53.87 L 53.80 53.87 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.59 54.01 L 51.59 54.01 Z\" /><path class=\"earthquake-japan-land\" d=\"M 53.93 54.03 L 53.93 54.03 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.76 54.24 L 52.76 54.24 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.65 54.33 L 52.66 54.21 L 52.65 54.33 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.32 54.29 L 52.32 54.29 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.43 54.39 L 52.43 54.39 Z\" /><path class=\"earthquake-japan-land\" d=\"M 97.90 3.74 L 97.86 3.48 L 98.27 2.95 L 98.23 2.50 L 98.41 2.71 L 98.98 2.69 L 99.16 2.64 L 99.29 2.57 L 99.47 2.22 L 99.72 2.17 L 100.25 2.71 L 100.85 2.99 L 102.53 4.27 L 103.30 5.26 L 104.98 6.56 L 106.74 7.40 L 107.08 7.69 L 107.48 7.84 L 107.80 7.94 L 109.50 8.39 L 111.23 8.58 L 111.28 8.91 L 111.49 9.16 L 112.03 9.34 L 113.11 9.46 L 113.98 9.40 L 115.08 8.63 L 115.96 8.20 L 116.67 7.52 L 116.83 7.91 L 115.48 9.58 L 115.34 10.21 L 115.73 10.70 L 116.71 10.97 L 116.75 11.06 L 116.73 11.10 L 116.45 11.13 L 116.70 10.99 L 115.98 10.80 L 116.38 11.77 L 116.93 12.31 L 117.46 12.42 L 118.25 11.86 L 118.81 11.82 L 119.07 11.95 L 117.85 12.34 L 117.79 12.63 L 117.53 12.80 L 117.61 12.88 L 117.03 12.79 L 115.73 12.98 L 115.44 13.42 L 114.87 13.72 L 114.38 13.70 L 114.17 13.57 L 114.27 13.41 L 114.00 13.37 L 113.61 13.73 L 113.87 13.94 L 112.26 13.89 L 111.83 13.76 L 111.80 13.64 L 111.35 13.62 L 110.24 13.90 L 109.60 14.21 L 107.99 15.27 L 106.95 16.29 L 106.55 16.99 L 106.68 17.32 L 106.56 17.93 L 106.30 18.17 L 106.25 18.52 L 105.68 18.06 L 104.82 17.64 L 104.09 17.54 L 102.42 16.95 L 100.98 16.15 L 100.15 15.98 L 99.36 15.50 L 98.16 15.32 L 98.48 15.19 L 96.75 15.71 L 95.62 16.27 L 95.01 16.81 L 94.65 16.65 L 94.91 16.71 L 95.04 16.60 L 94.59 16.50 L 94.36 16.09 L 93.90 15.91 L 93.87 15.74 L 93.55 15.53 L 92.34 15.52 L 91.58 16.27 L 91.38 16.77 L 91.38 16.90 L 91.43 17.03 L 91.99 17.20 L 92.73 17.66 L 93.53 17.55 L 93.80 17.65 L 94.79 18.55 L 95.74 18.84 L 95.93 19.08 L 95.56 19.15 L 95.27 19.42 L 94.84 19.50 L 93.87 19.20 L 93.51 19.36 L 93.59 19.06 L 93.21 19.01 L 93.01 19.35 L 92.23 19.61 L 92.20 20.21 L 92.04 20.38 L 91.30 20.54 L 91.00 20.92 L 90.73 20.78 L 90.45 20.83 L 90.14 20.63 L 89.92 19.97 L 90.36 19.07 L 90.61 18.99 L 90.66 18.29 L 90.13 17.67 L 89.61 17.57 L 89.41 17.24 L 88.88 17.00 L 88.91 16.57 L 89.15 16.39 L 89.26 16.08 L 89.12 15.39 L 89.49 15.09 L 90.23 15.02 L 90.71 14.76 L 90.93 14.42 L 91.23 14.69 L 91.53 14.64 L 91.53 14.41 L 91.95 13.99 L 92.61 13.67 L 92.63 13.49 L 91.63 12.63 L 91.73 12.12 L 92.12 12.14 L 92.48 11.94 L 93.15 12.28 L 93.21 12.42 L 93.89 12.61 L 93.96 12.75 L 95.08 12.55 L 95.06 12.76 L 95.81 12.98 L 96.44 12.74 L 97.12 12.14 L 97.14 11.73 L 96.79 11.28 L 96.93 10.97 L 96.65 10.34 L 96.94 9.97 L 97.81 9.73 L 98.16 9.27 L 98.24 9.34 L 98.24 7.66 L 98.73 7.12 L 98.96 6.17 L 98.62 4.91 L 97.90 3.74 Z\" /><path class=\"earthquake-japan-land\" d=\"M 95.16 3.30 L 94.84 2.43 L 95.05 2.57 L 95.17 2.45 L 95.34 2.62 L 95.16 3.30 Z\" /><path class=\"earthquake-japan-land\" d=\"M 95.75 3.52 L 95.99 3.36 L 96.37 3.48 L 96.65 3.85 L 96.15 4.09 L 95.71 3.80 L 95.75 3.52 Z\" /><path class=\"earthquake-japan-land\" d=\"M 118.74 8.80 L 118.72 8.62 L 119.96 7.61 L 120.47 6.89 L 120.83 6.74 L 121.24 7.02 L 121.25 7.06 L 121.23 7.86 L 120.47 7.94 L 120.23 8.25 L 119.55 8.53 L 119.32 8.85 L 119.39 8.99 L 119.07 9.01 L 118.91 9.40 L 117.97 9.68 L 117.72 10.64 L 117.73 10.31 L 117.17 10.37 L 117.03 9.81 L 118.74 8.80 Z\" /><path class=\"earthquake-japan-land\" d=\"M 97.12 7.14 L 96.91 7.12 L 97.13 7.06 L 97.12 7.14 Z\" /><path class=\"earthquake-japan-land\" d=\"M 96.47 7.21 L 96.68 7.13 L 96.47 7.21 Z\" /><path class=\"earthquake-japan-land\" d=\"M 116.20 11.04 L 116.20 11.04 Z\" /><path class=\"earthquake-japan-land\" d=\"M 116.62 11.05 L 116.62 11.05 Z\" /><path class=\"earthquake-japan-land\" d=\"M 116.64 11.06 L 116.64 11.06 Z\" /><path class=\"earthquake-japan-land\" d=\"M 120.58 11.55 L 120.30 11.26 L 120.66 11.14 L 121.04 11.21 L 120.90 11.34 L 120.97 11.41 L 120.58 11.55 Z\" /><path class=\"earthquake-japan-land\" d=\"M 119.49 11.74 L 119.30 11.56 L 119.74 11.56 L 119.67 11.64 L 119.77 11.70 L 119.49 11.74 Z\" /><path class=\"earthquake-japan-land\" d=\"M 120.22 11.81 L 120.13 11.78 L 120.22 11.68 L 120.55 11.64 L 120.22 11.81 Z\" /><path class=\"earthquake-japan-land\" d=\"M 120.82 11.76 L 120.82 11.76 Z\" /><path class=\"earthquake-japan-land\" d=\"M 120.76 11.78 L 120.76 11.78 Z\" /><path class=\"earthquake-japan-land\" d=\"M 119.45 11.90 L 119.45 11.90 Z\" /><path class=\"earthquake-japan-land\" d=\"M 119.99 11.99 L 120.11 11.91 L 119.99 11.99 Z\" /><path class=\"earthquake-japan-land\" d=\"M 93.01 12.24 L 93.01 12.24 Z\" /><path class=\"earthquake-japan-land\" d=\"M 118.35 12.28 L 118.35 12.28 Z\" /><path class=\"earthquake-japan-land\" d=\"M 118.04 12.61 L 118.04 12.61 Z\" /><path class=\"earthquake-japan-land\" d=\"M 96.32 12.72 L 96.45 12.59 L 96.32 12.72 Z\" /><path class=\"earthquake-japan-land\" d=\"M 118.00 12.70 L 118.00 12.70 Z\" /><path class=\"earthquake-japan-land\" d=\"M 115.64 13.33 L 115.87 13.29 L 115.64 13.33 Z\" /><path class=\"earthquake-japan-land\" d=\"M 115.49 13.43 L 115.58 13.39 L 115.49 13.43 Z\" /><path class=\"earthquake-japan-land\" d=\"M 114.33 13.88 L 114.37 13.80 L 114.33 13.88 Z\" /><path class=\"earthquake-japan-land\" d=\"M 87.25 17.94 L 87.11 17.86 L 87.03 17.36 L 87.19 17.19 L 87.80 17.03 L 87.52 17.74 L 87.25 17.94 Z\" /><path class=\"earthquake-japan-land\" d=\"M 86.70 20.47 L 86.70 20.34 L 86.92 20.41 L 86.70 20.47 Z\" /><path class=\"earthquake-japan-land\" d=\"M 89.00 21.12 L 89.08 21.07 L 89.00 21.12 Z\" /><path class=\"earthquake-japan-land\" d=\"M 99.59 2.15 L 99.59 2.15 Z\" /><path class=\"earthquake-japan-land\" d=\"M 94.81 2.25 L 94.81 2.25 Z\" /><path class=\"earthquake-japan-land\" d=\"M 94.81 2.25 L 94.81 2.25 Z\" /><path class=\"earthquake-japan-land\" d=\"M 94.83 2.35 L 94.83 2.35 Z\" /><path class=\"earthquake-japan-land\" d=\"M 94.80 2.39 L 94.80 2.39 Z\" /><path class=\"earthquake-japan-land\" d=\"M 94.82 2.36 L 94.82 2.36 Z\" /><path class=\"earthquake-japan-land\" d=\"M 106.28 18.56 L 106.28 18.56 Z\" /><path class=\"earthquake-japan-land\" d=\"M 87.01 17.37 L 87.01 17.37 Z\" /><path class=\"earthquake-japan-land\" d=\"M 64.34 47.01 L 64.27 47.33 L 64.63 47.67 L 65.18 47.55 L 65.22 47.69 L 65.24 48.15 L 64.95 48.24 L 64.67 48.15 L 64.63 48.59 L 65.28 48.80 L 65.34 48.92 L 65.54 48.79 L 65.79 48.82 L 65.78 48.97 L 65.98 49.08 L 65.93 49.22 L 66.37 49.20 L 66.41 49.34 L 66.95 49.41 L 67.00 49.65 L 66.65 49.84 L 66.77 49.89 L 66.73 50.16 L 67.34 50.34 L 67.09 50.41 L 67.22 50.46 L 67.08 50.82 L 67.30 51.21 L 66.96 51.45 L 66.88 51.47 L 66.87 51.46 L 67.01 51.37 L 66.86 51.45 L 66.61 51.25 L 65.95 51.43 L 65.92 51.59 L 65.30 51.70 L 64.83 51.61 L 64.24 51.27 L 64.13 51.33 L 64.05 51.17 L 63.73 51.05 L 63.25 51.04 L 63.28 50.96 L 63.23 51.06 L 63.11 50.98 L 62.85 51.10 L 62.64 50.99 L 62.37 51.11 L 62.33 50.87 L 62.32 51.07 L 62.15 51.07 L 62.05 51.24 L 61.79 51.13 L 61.61 51.26 L 61.58 50.90 L 61.32 50.79 L 61.31 50.52 L 61.47 50.42 L 61.27 50.28 L 61.43 50.02 L 61.34 49.90 L 61.58 49.80 L 61.83 49.34 L 62.04 49.33 L 61.92 48.98 L 62.57 48.74 L 62.57 48.39 L 62.36 48.28 L 62.40 48.07 L 62.20 47.99 L 62.06 47.66 L 62.10 47.44 L 61.85 47.21 L 62.68 46.96 L 63.11 47.09 L 63.82 46.93 L 64.20 47.08 L 64.34 47.01 Z\" /><path class=\"earthquake-japan-land\" d=\"M 63.35 46.99 L 63.35 46.99 Z\" /><path class=\"earthquake-japan-land\" d=\"M 63.49 51.09 L 63.49 51.09 Z\" /><path class=\"earthquake-japan-land\" d=\"M 66.65 51.32 L 66.65 51.32 Z\" /><path class=\"earthquake-japan-land\" d=\"M 66.47 51.34 L 66.47 51.34 Z\" /><path class=\"earthquake-japan-land\" d=\"M 66.61 51.34 L 66.61 51.34 Z\" /><path class=\"earthquake-japan-land\" d=\"M 66.74 51.35 L 66.74 51.35 Z\" /><path class=\"earthquake-japan-land\" d=\"M 64.26 51.39 L 64.24 51.31 L 64.26 51.39 Z\" /><path class=\"earthquake-japan-land\" d=\"M 64.34 51.37 L 64.34 51.37 Z\" /><path class=\"earthquake-japan-land\" d=\"M 66.27 51.46 L 66.44 51.38 L 66.27 51.46 Z\" /><path class=\"earthquake-japan-land\" d=\"M 63.20 51.44 L 63.20 51.44 Z\" /><path class=\"earthquake-japan-land\" d=\"M 62.71 51.55 L 62.54 51.47 L 62.67 51.43 L 62.71 51.55 Z\" /><path class=\"earthquake-japan-land\" d=\"M 66.09 51.59 L 66.10 51.44 L 66.23 51.59 L 66.09 51.59 Z\" /><path class=\"earthquake-japan-land\" d=\"M 63.05 51.47 L 63.05 51.47 Z\" /><path class=\"earthquake-japan-land\" d=\"M 62.86 51.59 L 62.87 51.47 L 62.86 51.59 Z\" /><path class=\"earthquake-japan-land\" d=\"M 62.34 51.63 L 62.33 51.52 L 62.47 51.51 L 62.50 51.61 L 62.34 51.63 Z\" /><path class=\"earthquake-japan-land\" d=\"M 62.58 51.66 L 62.57 51.55 L 62.58 51.66 Z\" /><path class=\"earthquake-japan-land\" d=\"M 62.17 51.60 L 62.17 51.60 Z\" /><path class=\"earthquake-japan-land\" d=\"M 62.66 51.63 L 62.66 51.63 Z\" /><path class=\"earthquake-japan-land\" d=\"M 62.94 51.65 L 62.94 51.65 Z\" /><path class=\"earthquake-japan-land\" d=\"M 66.06 51.69 L 66.21 51.65 L 66.06 51.69 Z\" /><path class=\"earthquake-japan-land\" d=\"M 62.48 51.68 L 62.48 51.68 Z\" /><path class=\"earthquake-japan-land\" d=\"M 63.94 52.60 L 64.91 51.81 L 65.10 51.86 L 64.90 52.26 L 64.47 52.64 L 64.48 52.98 L 64.76 53.33 L 63.65 53.69 L 63.50 53.54 L 63.61 53.39 L 63.29 53.45 L 63.27 53.21 L 63.43 53.04 L 63.65 53.05 L 63.94 52.60 Z\" /><path class=\"earthquake-japan-land\" d=\"M 62.38 51.85 L 62.38 51.85 Z\" /><path class=\"earthquake-japan-land\" d=\"M 64.78 53.29 L 64.73 53.19 L 64.78 53.29 Z\" /><path class=\"earthquake-japan-land\" d=\"M 64.06 53.83 L 64.12 53.74 L 64.06 53.83 Z\" /><path class=\"earthquake-japan-land\" d=\"M 88.88 45.04 L 89.70 45.73 L 90.77 46.17 L 91.59 46.07 L 92.29 45.79 L 92.51 45.88 L 92.44 45.78 L 92.56 45.64 L 94.35 46.74 L 94.33 46.85 L 94.15 46.76 L 93.28 46.87 L 92.63 47.26 L 92.06 47.90 L 91.96 48.29 L 92.07 48.60 L 91.92 49.15 L 91.56 49.39 L 90.61 49.47 L 90.42 49.71 L 89.91 49.95 L 89.78 50.31 L 89.44 50.46 L 89.19 50.44 L 88.77 50.15 L 89.29 49.99 L 89.05 49.82 L 89.21 49.61 L 89.08 49.19 L 89.35 48.93 L 89.21 48.66 L 88.90 48.57 L 89.20 48.48 L 89.23 48.30 L 89.48 48.37 L 89.59 48.23 L 89.53 48.04 L 89.87 47.96 L 89.91 47.84 L 89.95 47.95 L 90.11 47.88 L 90.31 47.53 L 90.48 47.57 L 90.58 47.50 L 90.46 47.43 L 90.64 47.42 L 90.43 47.41 L 90.59 47.29 L 89.94 47.02 L 89.92 46.85 L 89.66 46.93 L 89.70 47.09 L 89.36 47.16 L 89.59 46.83 L 89.40 46.52 L 89.50 46.07 L 88.88 45.04 Z\" /><path class=\"earthquake-japan-land\" d=\"M 89.82 46.94 L 89.82 46.94 Z\" /><path class=\"earthquake-japan-land\" d=\"M 88.84 48.57 L 88.84 48.57 Z\" /><path class=\"earthquake-japan-land\" d=\"M 88.72 48.59 L 88.72 48.59 Z\" /><path class=\"earthquake-japan-land\" d=\"M 78.17 41.00 L 78.60 41.24 L 78.81 42.43 L 78.75 42.77 L 78.44 42.90 L 78.53 43.10 L 78.35 43.13 L 77.96 43.68 L 77.03 43.52 L 76.95 43.37 L 76.57 43.52 L 76.54 43.35 L 76.23 43.36 L 76.03 43.51 L 75.80 43.38 L 74.88 44.21 L 74.73 43.88 L 74.37 43.90 L 74.36 43.78 L 74.16 44.06 L 73.96 44.09 L 73.92 43.90 L 74.04 43.83 L 73.84 43.50 L 73.98 43.43 L 74.08 42.95 L 73.92 42.62 L 74.12 42.41 L 73.95 42.19 L 74.24 42.01 L 74.48 41.25 L 75.19 41.06 L 74.92 41.49 L 75.57 41.90 L 75.46 41.95 L 76.59 42.01 L 76.96 41.79 L 77.18 41.22 L 78.17 41.00 Z\" /><path class=\"earthquake-japan-land\" d=\"M 84.72 46.12 L 85.12 45.92 L 86.51 46.21 L 86.96 46.53 L 87.71 46.33 L 87.58 46.52 L 87.74 46.48 L 87.74 46.57 L 88.11 46.51 L 88.21 46.37 L 88.69 46.45 L 88.78 46.31 L 89.11 46.30 L 89.47 46.44 L 89.59 46.83 L 89.36 47.10 L 88.99 47.17 L 88.95 47.01 L 88.81 47.03 L 88.72 47.32 L 88.77 47.45 L 88.93 47.41 L 89.04 47.55 L 88.97 47.58 L 88.95 47.61 L 88.51 47.56 L 88.33 47.32 L 87.81 47.12 L 87.63 47.08 L 87.48 47.25 L 87.31 47.16 L 87.27 47.25 L 87.54 47.38 L 87.37 47.38 L 87.34 47.72 L 86.99 47.34 L 86.20 47.24 L 86.08 47.06 L 85.13 46.73 L 84.72 46.12 Z\" /><path class=\"earthquake-japan-land\" d=\"M 89.11 47.12 L 89.11 47.12 Z\" /><path class=\"earthquake-japan-land\" d=\"M 89.29 47.11 L 89.29 47.11 Z\" /><path class=\"earthquake-japan-land\" d=\"M 89.34 47.12 L 89.34 47.12 Z\" /><path class=\"earthquake-japan-land\" d=\"M 88.84 47.15 L 88.94 47.26 L 88.84 47.15 Z\" /><path class=\"earthquake-japan-land\" d=\"M 88.77 47.16 L 88.77 47.16 Z\" /><path class=\"earthquake-japan-land\" d=\"M 89.18 47.22 L 89.13 47.14 L 89.18 47.22 Z\" /><path class=\"earthquake-japan-land\" d=\"M 88.97 47.21 L 88.97 47.21 Z\" /><path class=\"earthquake-japan-land\" d=\"M 88.75 47.32 L 88.79 47.20 L 88.94 47.36 L 88.75 47.32 Z\" /><path class=\"earthquake-japan-land\" d=\"M 88.96 47.30 L 89.10 47.23 L 88.96 47.30 Z\" /><path class=\"earthquake-japan-land\" d=\"M 89.07 47.32 L 89.03 47.28 L 89.10 47.24 L 89.13 47.29 L 89.07 47.32 Z\" /><path class=\"earthquake-japan-land\" d=\"M 89.03 47.34 L 89.03 47.34 Z\" /><path class=\"earthquake-japan-land\" d=\"M 88.83 47.43 L 88.83 47.43 Z\" /><path class=\"earthquake-japan-land\" d=\"M 87.19 51.46 L 86.80 51.36 L 86.80 50.91 L 87.17 51.04 L 87.19 51.46 Z\" /><path class=\"earthquake-japan-land\" d=\"M 86.38 52.22 L 86.40 52.12 L 86.38 52.22 Z\" /><path class=\"earthquake-japan-land\" d=\"M 86.47 52.41 L 86.47 52.41 Z\" /><path class=\"earthquake-japan-land\" d=\"M 86.36 53.05 L 86.21 52.90 L 86.39 52.59 L 86.36 53.05 Z\" /><path class=\"earthquake-japan-land\" d=\"M 86.14 52.88 L 86.14 52.88 Z\" /><path class=\"earthquake-japan-land\" d=\"M 86.05 53.01 L 86.05 53.01 Z\" /><path class=\"earthquake-japan-land\" d=\"M 86.07 53.11 L 86.05 53.02 L 86.07 53.11 Z\" /><path class=\"earthquake-japan-land\" d=\"M 86.39 53.07 L 86.39 53.07 Z\" /><path class=\"earthquake-japan-land\" d=\"M 85.64 53.70 L 85.68 53.45 L 85.85 53.49 L 85.88 53.61 L 85.64 53.70 Z\" /><path class=\"earthquake-japan-land\" d=\"M 85.96 53.61 L 85.96 53.61 Z\" /><path class=\"earthquake-japan-land\" d=\"M 85.36 53.71 L 85.36 53.71 Z\" /><path class=\"earthquake-japan-land\" d=\"M 87.51 54.34 L 87.37 54.20 L 87.46 54.01 L 87.79 54.04 L 87.81 54.23 L 87.51 54.34 Z\" /><path class=\"earthquake-japan-land\" d=\"M 88.10 55.22 L 87.89 55.17 L 87.89 55.09 L 87.95 55.01 L 88.11 55.06 L 88.10 55.22 Z\" /><path class=\"earthquake-japan-land\" d=\"M 89.16 58.88 L 88.77 58.62 L 88.73 58.38 L 89.23 58.56 L 89.29 58.73 L 89.16 58.88 Z\" /><path class=\"earthquake-japan-land\" d=\"M 88.50 58.56 L 88.38 58.47 L 88.50 58.56 Z\" /><path class=\"earthquake-japan-land\" d=\"M 88.85 61.63 L 88.79 61.49 L 88.85 61.63 Z\" /><path class=\"earthquake-japan-land\" d=\"M 90.26 66.19 L 90.26 66.19 Z\" /><path class=\"earthquake-japan-land\" d=\"M 91.49 70.58 L 91.52 70.48 L 91.49 70.58 Z\" /><path class=\"earthquake-japan-land\" d=\"M 91.71 73.67 L 91.71 73.67 Z\" /><path class=\"earthquake-japan-land\" d=\"M 100.51 83.11 L 100.51 83.11 Z\" /><path class=\"earthquake-japan-land\" d=\"M 100.55 83.11 L 100.55 83.11 Z\" /><path class=\"earthquake-japan-land\" d=\"M 100.73 83.32 L 100.63 83.25 L 100.73 83.32 Z\" /><path class=\"earthquake-japan-land\" d=\"M 100.63 83.28 L 100.63 83.28 Z\" /><path class=\"earthquake-japan-land\" d=\"M 100.79 83.39 L 100.79 83.39 Z\" /><path class=\"earthquake-japan-land\" d=\"M 100.93 83.55 L 100.85 83.49 L 100.93 83.55 Z\" /><path class=\"earthquake-japan-land\" d=\"M 101.06 84.14 L 101.06 84.14 Z\" /><path class=\"earthquake-japan-land\" d=\"M 101.03 84.15 L 101.03 84.15 Z\" /><path class=\"earthquake-japan-land\" d=\"M 94.38 85.26 L 94.38 85.26 Z\" /><path class=\"earthquake-japan-land\" d=\"M 100.98 85.49 L 100.98 85.49 Z\" /><path class=\"earthquake-japan-land\" d=\"M 100.94 85.71 L 100.94 85.51 L 100.94 85.71 Z\" /><path class=\"earthquake-japan-land\" d=\"M 101.10 85.87 L 100.95 85.72 L 101.10 85.87 Z\" /><path class=\"earthquake-japan-land\" d=\"M 100.91 85.79 L 100.91 85.79 Z\" /><path class=\"earthquake-japan-land\" d=\"M 100.82 85.85 L 100.82 85.85 Z\" /><path class=\"earthquake-japan-land\" d=\"M 101.10 86.20 L 100.92 86.17 L 101.04 85.98 L 100.93 85.89 L 101.16 86.01 L 101.10 86.20 Z\" /><path class=\"earthquake-japan-land\" d=\"M 101.23 85.96 L 101.23 85.96 Z\" /><path class=\"earthquake-japan-land\" d=\"M 100.92 85.98 L 100.92 85.98 Z\" /><path class=\"earthquake-japan-land\" d=\"M 100.88 86.17 L 100.88 86.17 Z\" /><path class=\"earthquake-japan-land\" d=\"M 100.88 86.22 L 100.88 86.22 Z\" /><path class=\"earthquake-japan-land\" d=\"M 100.61 87.66 L 100.61 87.66 Z\" /><path class=\"earthquake-japan-land\" d=\"M 100.89 88.15 L 100.62 87.67 L 100.94 87.92 L 100.89 88.15 Z\" /><path class=\"earthquake-japan-land\" d=\"M 100.64 88.21 L 100.64 88.21 Z\" /><path class=\"earthquake-japan-land\" d=\"M 100.74 88.27 L 100.74 88.27 Z\" /><path class=\"earthquake-japan-land\" d=\"M 101.14 88.35 L 101.14 88.35 Z\" /><path class=\"earthquake-japan-land\" d=\"M 100.78 88.44 L 100.77 88.35 L 100.78 88.44 Z\" /><path class=\"earthquake-japan-land\" d=\"M 101.01 88.40 L 101.09 88.35 L 101.01 88.40 Z\" /><path class=\"earthquake-japan-land\" d=\"M 96.39 93.56 L 96.41 93.42 L 96.39 93.56 Z\" /><path class=\"earthquake-japan-land\" d=\"M 96.43 96.61 L 96.43 96.41 L 96.64 96.31 L 96.72 96.48 L 96.43 96.61 Z\" /><path class=\"earthquake-japan-land\" d=\"M 97.30 98.98 L 97.36 98.90 L 97.30 98.98 Z\" /><path class=\"earthquake-japan-land\" d=\"M 86.92 54.32 L 86.92 54.32 Z\" /><path class=\"earthquake-japan-land\" d=\"M 84.19 54.71 L 84.19 54.71 Z\" /><path class=\"earthquake-japan-land\" d=\"M 84.18 54.71 L 84.18 54.71 Z\" /><path class=\"earthquake-japan-land\" d=\"M 86.49 56.13 L 86.49 56.13 Z\" /><path class=\"earthquake-japan-land\" d=\"M 100.78 83.21 L 100.78 83.21 Z\" /><path class=\"earthquake-japan-land\" d=\"M 100.58 82.99 L 100.58 82.99 Z\" /><path class=\"earthquake-japan-land\" d=\"M 100.58 83.01 L 100.58 83.01 Z\" /><path class=\"earthquake-japan-land\" d=\"M 101.09 84.11 L 101.09 84.11 Z\" /><path class=\"earthquake-japan-land\" d=\"M 96.43 96.33 L 96.43 96.33 Z\" /><path class=\"earthquake-japan-land\" d=\"M 84.08 54.79 L 84.08 54.79 Z\" /><path class=\"earthquake-japan-land\" d=\"M 84.08 54.79 L 84.08 54.79 Z\" /><path class=\"earthquake-japan-land\" d=\"M 84.09 54.80 L 84.09 54.80 Z\" /><path class=\"earthquake-japan-land\" d=\"M 84.09 54.80 L 84.09 54.80 Z\" /><path class=\"earthquake-japan-land\" d=\"M 89.59 64.15 L 89.59 64.15 Z\" /><path class=\"earthquake-japan-land\" d=\"M 100.56 82.98 L 100.56 82.98 Z\" /><path class=\"earthquake-japan-land\" d=\"M 85.65 44.17 L 86.62 44.41 L 86.80 44.30 L 87.29 44.59 L 88.43 44.53 L 88.65 45.05 L 88.88 45.04 L 89.44 45.92 L 89.47 46.44 L 88.84 46.28 L 88.69 46.45 L 88.29 46.36 L 87.74 46.57 L 87.74 46.48 L 87.58 46.52 L 87.71 46.33 L 86.96 46.53 L 86.51 46.21 L 85.12 45.92 L 84.46 46.18 L 83.64 45.87 L 83.56 45.52 L 83.78 45.30 L 84.14 45.28 L 84.79 44.89 L 85.21 44.87 L 85.65 44.17 Z\" /><path class=\"earthquake-japan-land\" d=\"M 45.69 51.10 L 45.65 50.92 L 45.81 51.01 L 45.69 51.10 Z\" /><path class=\"earthquake-japan-land\" d=\"M 48.45 51.45 L 48.63 51.92 L 48.34 52.25 L 48.49 52.57 L 48.97 52.56 L 48.82 52.81 L 48.88 53.03 L 49.15 53.17 L 49.60 53.01 L 49.79 53.15 L 50.06 52.86 L 49.98 52.60 L 50.33 52.42 L 50.35 52.93 L 50.63 53.03 L 50.72 53.47 L 51.02 53.51 L 50.98 53.62 L 51.22 53.59 L 51.23 53.87 L 51.00 54.00 L 51.06 54.53 L 50.92 54.72 L 50.59 54.77 L 50.79 55.25 L 50.58 55.31 L 50.60 55.11 L 50.22 54.96 L 50.29 54.89 L 50.12 54.99 L 49.85 54.92 L 49.32 54.52 L 48.97 54.60 L 49.05 54.69 L 48.81 54.66 L 49.13 54.41 L 48.91 54.41 L 48.98 54.27 L 48.71 54.32 L 48.76 54.22 L 48.05 54.45 L 47.98 54.35 L 47.70 54.56 L 47.37 54.37 L 47.40 54.49 L 47.18 54.62 L 47.09 54.48 L 46.98 54.62 L 47.08 54.44 L 46.92 54.32 L 46.77 54.70 L 46.33 54.90 L 46.16 54.88 L 46.19 54.77 L 45.89 54.86 L 45.85 54.56 L 45.67 54.59 L 45.18 54.29 L 44.52 54.94 L 44.36 54.78 L 44.59 54.79 L 44.56 54.28 L 44.30 54.05 L 44.63 53.77 L 44.65 53.59 L 44.33 53.24 L 44.50 52.90 L 44.63 52.99 L 45.17 52.86 L 45.06 52.71 L 44.66 52.76 L 44.86 52.54 L 45.09 52.68 L 45.65 52.65 L 45.77 52.85 L 45.99 52.74 L 46.07 52.86 L 46.12 52.76 L 46.53 52.81 L 46.68 52.64 L 47.07 52.61 L 46.98 52.45 L 47.31 52.34 L 47.28 52.15 L 47.68 51.99 L 47.78 51.75 L 48.01 51.71 L 48.01 51.54 L 48.24 51.63 L 48.45 51.45 Z\" /><path class=\"earthquake-japan-land\" d=\"M 47.40 51.94 L 47.40 51.94 Z\" /><path class=\"earthquake-japan-land\" d=\"M 47.57 51.98 L 47.57 51.98 Z\" /><path class=\"earthquake-japan-land\" d=\"M 46.93 52.22 L 46.93 52.22 Z\" /><path class=\"earthquake-japan-land\" d=\"M 46.38 52.29 L 46.38 52.19 L 46.38 52.29 Z\" /><path class=\"earthquake-japan-land\" d=\"M 47.04 52.32 L 47.06 52.21 L 47.04 52.32 Z\" /><path class=\"earthquake-japan-land\" d=\"M 46.72 52.28 L 46.72 52.28 Z\" /><path class=\"earthquake-japan-land\" d=\"M 46.88 52.36 L 46.88 52.36 Z\" /><path class=\"earthquake-japan-land\" d=\"M 46.88 52.45 L 46.88 52.45 Z\" /><path class=\"earthquake-japan-land\" d=\"M 45.98 52.74 L 45.85 52.59 L 46.30 52.60 L 45.98 52.74 Z\" /><path class=\"earthquake-japan-land\" d=\"M 46.60 52.61 L 46.60 52.61 Z\" /><path class=\"earthquake-japan-land\" d=\"M 46.34 52.68 L 46.34 52.68 Z\" /><path class=\"earthquake-japan-land\" d=\"M 44.23 53.00 L 44.40 52.89 L 44.23 53.00 Z\" /><path class=\"earthquake-japan-land\" d=\"M 44.83 52.92 L 44.83 52.92 Z\" /><path class=\"earthquake-japan-land\" d=\"M 44.49 53.74 L 44.49 53.74 Z\" /><path class=\"earthquake-japan-land\" d=\"M 44.49 53.77 L 44.49 53.77 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.56 53.99 L 51.56 53.99 Z\" /><path class=\"earthquake-japan-land\" d=\"M 43.98 54.13 L 43.88 54.02 L 43.98 54.13 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.99 54.30 L 51.99 54.30 Z\" /><path class=\"earthquake-japan-land\" d=\"M 48.66 54.45 L 48.90 54.32 L 48.66 54.45 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.92 54.42 L 51.92 54.42 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.12 54.40 L 52.12 54.40 Z\" /><path class=\"earthquake-japan-land\" d=\"M 48.59 54.64 L 48.45 54.51 L 48.54 54.39 L 48.59 54.64 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.10 54.49 L 52.01 54.42 L 52.10 54.49 Z\" /><path class=\"earthquake-japan-land\" d=\"M 47.83 54.61 L 47.83 54.49 L 48.00 54.48 L 47.83 54.61 Z\" /><path class=\"earthquake-japan-land\" d=\"M 48.98 54.46 L 48.98 54.46 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.34 54.57 L 51.34 54.57 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.16 54.54 L 52.16 54.54 Z\" /><path class=\"earthquake-japan-land\" d=\"M 45.09 54.55 L 45.09 54.55 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.66 54.59 L 51.66 54.59 Z\" /><path class=\"earthquake-japan-land\" d=\"M 45.13 54.57 L 45.13 54.57 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.75 54.61 L 51.75 54.61 Z\" /><path class=\"earthquake-japan-land\" d=\"M 49.10 54.86 L 49.03 54.76 L 49.34 54.63 L 49.10 54.86 Z\" /><path class=\"earthquake-japan-land\" d=\"M 48.68 54.64 L 48.68 54.64 Z\" /><path class=\"earthquake-japan-land\" d=\"M 44.30 54.68 L 44.30 54.68 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.75 54.72 L 51.75 54.72 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.03 55.20 L 50.86 54.90 L 51.07 54.70 L 51.42 54.75 L 51.64 54.99 L 52.08 54.76 L 52.35 54.77 L 51.86 54.95 L 51.86 55.17 L 51.63 55.19 L 51.68 55.08 L 51.43 54.99 L 51.39 55.13 L 51.03 55.20 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.37 54.76 L 52.37 54.76 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.76 54.82 L 51.68 54.75 L 51.76 54.82 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.44 54.76 L 52.44 54.76 Z\" /><path class=\"earthquake-japan-land\" d=\"M 48.48 54.84 L 48.48 54.84 Z\" /><path class=\"earthquake-japan-land\" d=\"M 50.79 54.83 L 50.79 54.83 Z\" /><path class=\"earthquake-japan-land\" d=\"M 49.65 54.84 L 49.65 54.84 Z\" /><path class=\"earthquake-japan-land\" d=\"M 44.65 54.86 L 44.65 54.86 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.33 54.93 L 52.33 54.93 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.96 55.00 L 51.96 55.00 Z\" /><path class=\"earthquake-japan-land\" d=\"M 50.25 55.06 L 50.25 55.06 Z\" /><path class=\"earthquake-japan-land\" d=\"M 50.30 55.15 L 50.30 55.15 Z\" /><path class=\"earthquake-japan-land\" d=\"M 50.11 55.22 L 49.98 55.18 L 50.11 55.22 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.55 55.17 L 51.55 55.17 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.84 55.24 L 51.84 55.24 Z\" /><path class=\"earthquake-japan-land\" d=\"M 50.25 55.52 L 50.14 55.48 L 50.39 55.33 L 50.35 55.19 L 50.59 55.32 L 50.25 55.52 Z\" /><path class=\"earthquake-japan-land\" d=\"M 50.92 55.25 L 50.92 55.25 Z\" /><path class=\"earthquake-japan-land\" d=\"M 50.59 55.40 L 50.59 55.40 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.28 55.61 L 50.86 55.43 L 51.11 55.39 L 51.37 55.54 L 51.28 55.61 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.26 55.43 L 51.26 55.43 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.97 55.45 L 51.97 55.45 Z\" /><path class=\"earthquake-japan-land\" d=\"M 49.82 55.60 L 49.83 55.46 L 49.96 55.54 L 49.82 55.60 Z\" /><path class=\"earthquake-japan-land\" d=\"M 49.69 55.51 L 49.69 55.51 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.96 55.56 L 51.96 55.56 Z\" /><path class=\"earthquake-japan-land\" d=\"M 50.26 55.58 L 50.26 55.58 Z\" /><path class=\"earthquake-japan-land\" d=\"M 50.67 55.85 L 50.75 55.62 L 50.67 55.85 Z\" /><path class=\"earthquake-japan-land\" d=\"M 50.11 55.75 L 50.11 55.75 Z\" /><path class=\"earthquake-japan-land\" d=\"M 91.40 36.47 L 91.76 36.59 L 92.04 36.48 L 92.38 36.60 L 92.44 36.82 L 92.84 36.71 L 93.45 36.87 L 93.43 37.21 L 93.64 37.36 L 94.00 37.38 L 93.88 37.24 L 94.26 37.29 L 94.28 36.86 L 94.50 36.80 L 94.93 37.16 L 95.22 38.72 L 95.14 39.83 L 94.84 41.04 L 94.09 41.32 L 93.93 41.56 L 93.08 41.35 L 92.88 41.17 L 92.96 41.49 L 92.32 41.86 L 91.89 41.65 L 91.82 41.43 L 91.22 41.17 L 91.25 40.79 L 91.02 40.80 L 90.69 40.43 L 89.51 40.21 L 89.15 40.31 L 89.11 40.52 L 88.37 40.65 L 87.68 41.00 L 87.30 41.05 L 86.97 41.31 L 86.16 41.20 L 86.28 40.96 L 86.27 40.16 L 85.82 39.83 L 86.17 39.35 L 86.16 39.15 L 85.99 39.04 L 86.08 38.90 L 86.99 38.82 L 87.14 38.57 L 87.93 38.58 L 87.75 37.96 L 88.14 37.78 L 88.29 37.48 L 88.71 37.19 L 88.56 37.02 L 88.41 37.06 L 88.54 37.02 L 89.05 37.26 L 89.69 37.14 L 89.96 37.46 L 90.25 37.37 L 90.59 37.57 L 91.19 37.51 L 91.49 37.23 L 91.31 37.11 L 91.40 36.47 Z\" /><path class=\"earthquake-japan-land\" d=\"M 74.57 37.07 L 74.57 37.07 Z\" /><path class=\"earthquake-japan-land\" d=\"M 74.51 38.14 L 74.51 38.14 Z\" /><path class=\"earthquake-japan-land\" d=\"M 74.39 38.24 L 74.39 38.24 Z\" /><path class=\"earthquake-japan-land\" d=\"M 74.28 38.24 L 74.28 38.24 Z\" /><path class=\"earthquake-japan-land\" d=\"M 75.43 38.79 L 76.38 38.48 L 76.72 38.56 L 76.80 38.86 L 76.28 38.95 L 76.19 39.21 L 76.34 39.38 L 76.17 39.55 L 75.75 39.51 L 75.05 40.08 L 74.73 39.93 L 74.82 39.84 L 74.62 39.85 L 74.53 39.92 L 74.63 40.00 L 74.36 40.25 L 74.50 40.28 L 74.29 40.58 L 74.68 40.52 L 74.85 40.69 L 75.29 40.42 L 75.28 41.05 L 74.48 41.25 L 74.24 42.01 L 73.95 42.19 L 74.12 42.41 L 73.92 42.66 L 74.08 42.95 L 73.98 43.43 L 73.84 43.53 L 74.04 43.83 L 73.92 43.90 L 73.96 44.09 L 74.26 44.33 L 73.83 44.72 L 73.77 45.06 L 73.37 45.15 L 72.76 44.75 L 72.20 44.83 L 72.05 44.67 L 71.72 44.67 L 71.66 44.41 L 71.22 44.11 L 72.08 43.55 L 72.87 42.79 L 73.76 41.59 L 73.84 40.90 L 73.61 40.66 L 73.64 40.30 L 73.35 40.23 L 73.67 39.61 L 73.62 39.42 L 74.21 39.09 L 74.62 39.11 L 75.43 38.79 Z\" /><path class=\"earthquake-japan-land\" d=\"M 74.73 40.49 L 74.51 40.22 L 74.62 40.31 L 74.83 40.20 L 75.03 40.29 L 75.18 40.15 L 75.27 40.23 L 75.20 40.38 L 74.73 40.49 Z\" /><path class=\"earthquake-japan-land\" d=\"M 74.46 40.45 L 74.46 40.45 Z\" /><path class=\"earthquake-japan-land\" d=\"M 71.22 44.11 L 71.66 44.41 L 71.80 44.70 L 72.05 44.67 L 72.28 44.83 L 72.76 44.75 L 73.32 45.15 L 73.77 45.06 L 73.63 45.47 L 73.96 45.70 L 74.14 46.14 L 73.95 46.37 L 72.62 46.42 L 72.53 46.59 L 71.89 46.39 L 71.64 46.48 L 71.40 47.01 L 70.75 46.83 L 70.67 46.96 L 70.84 47.43 L 70.57 47.35 L 70.53 47.60 L 70.13 47.59 L 70.03 47.77 L 69.70 47.63 L 69.45 48.16 L 69.08 48.12 L 68.84 48.38 L 68.50 48.44 L 67.64 48.27 L 67.63 48.09 L 67.30 47.87 L 67.32 47.50 L 67.43 47.46 L 67.40 47.63 L 67.59 47.50 L 67.54 47.71 L 67.67 47.78 L 68.30 47.51 L 68.34 47.61 L 68.14 47.63 L 68.13 47.78 L 67.90 47.77 L 68.59 47.80 L 68.82 47.56 L 68.59 47.64 L 68.44 47.50 L 68.57 47.41 L 68.99 47.61 L 69.17 47.56 L 69.01 47.40 L 69.20 47.44 L 69.28 47.31 L 69.07 47.08 L 69.33 47.23 L 69.90 47.14 L 69.77 46.72 L 70.08 46.53 L 70.21 46.79 L 70.12 46.91 L 70.37 46.99 L 70.50 46.47 L 69.97 45.96 L 69.98 45.75 L 69.79 45.54 L 70.56 44.52 L 70.65 44.58 L 70.62 44.32 L 71.22 44.11 Z\" /><path class=\"earthquake-japan-land\" d=\"M 70.59 44.32 L 70.59 44.32 Z\" /><path class=\"earthquake-japan-land\" d=\"M 69.01 47.13 L 69.01 47.13 Z\" /><path class=\"earthquake-japan-land\" d=\"M 54.80 53.68 L 54.71 53.60 L 54.97 53.40 L 54.82 53.35 L 55.12 53.20 L 55.29 53.54 L 54.80 53.68 Z\" /><path class=\"earthquake-japan-land\" d=\"M 56.03 53.46 L 56.14 53.22 L 56.03 53.46 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.87 53.24 L 55.87 53.24 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.82 53.25 L 55.82 53.25 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.89 53.38 L 55.85 53.25 L 55.89 53.38 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.66 53.45 L 55.76 53.27 L 55.83 53.38 L 55.66 53.45 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.90 53.51 L 55.99 53.39 L 55.90 53.51 Z\" /><path class=\"earthquake-japan-land\" d=\"M 54.75 53.45 L 54.75 53.45 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.76 53.49 L 55.86 53.45 L 55.76 53.49 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.55 53.68 L 55.28 53.60 L 55.31 53.48 L 55.70 53.54 L 55.55 53.68 Z\" /><path class=\"earthquake-japan-land\" d=\"M 56.26 53.50 L 56.26 53.50 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.74 53.56 L 55.74 53.56 Z\" /><path class=\"earthquake-japan-land\" d=\"M 54.67 53.64 L 54.67 53.64 Z\" /><path class=\"earthquake-japan-land\" d=\"M 54.66 53.71 L 54.62 53.63 L 54.66 53.69 L 54.66 53.71 Z\" /><path class=\"earthquake-japan-land\" d=\"M 56.34 53.72 L 56.34 53.72 Z\" /><path class=\"earthquake-japan-land\" d=\"M 54.41 53.75 L 54.31 53.66 L 54.45 53.67 L 54.41 53.75 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.38 53.66 L 55.38 53.66 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.17 54.06 L 55.06 54.04 L 55.20 53.87 L 55.14 53.67 L 55.55 53.73 L 55.17 54.06 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.42 53.72 L 55.42 53.72 Z\" /><path class=\"earthquake-japan-land\" d=\"M 54.49 53.70 L 54.49 53.70 Z\" /><path class=\"earthquake-japan-land\" d=\"M 54.68 53.69 L 54.68 53.69 Z\" /><path class=\"earthquake-japan-land\" d=\"M 56.58 53.77 L 56.58 53.77 Z\" /><path class=\"earthquake-japan-land\" d=\"M 56.81 53.81 L 56.81 53.81 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.04 53.87 L 54.94 53.84 L 55.04 53.87 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.65 56.19 L 53.30 55.87 L 53.50 55.63 L 53.50 55.07 L 53.76 54.96 L 53.82 54.55 L 54.61 54.24 L 54.63 54.06 L 54.45 54.01 L 54.70 53.90 L 55.59 54.89 L 56.60 54.57 L 57.56 54.68 L 57.99 54.35 L 58.42 54.51 L 58.45 54.93 L 58.30 55.08 L 57.76 55.08 L 57.48 55.32 L 56.38 55.31 L 56.18 55.53 L 55.97 55.48 L 55.58 56.09 L 55.38 56.12 L 55.39 56.32 L 55.23 56.48 L 55.32 56.62 L 55.07 56.91 L 54.06 56.97 L 54.18 57.27 L 54.51 57.55 L 54.48 57.67 L 53.97 57.84 L 53.87 58.15 L 53.48 58.46 L 53.09 58.27 L 53.33 58.65 L 53.42 59.32 L 52.99 59.49 L 53.01 59.33 L 52.74 59.34 L 52.84 59.41 L 52.57 59.32 L 52.63 59.40 L 52.48 59.47 L 52.63 59.48 L 52.46 59.55 L 52.30 59.37 L 52.51 59.29 L 52.35 59.23 L 52.48 59.15 L 52.47 59.25 L 52.77 59.27 L 52.56 59.20 L 52.41 58.87 L 52.04 58.84 L 52.05 58.97 L 51.89 58.99 L 52.07 58.76 L 52.41 58.84 L 52.23 58.53 L 52.51 58.50 L 52.20 58.47 L 52.15 58.32 L 52.32 58.31 L 52.03 58.16 L 52.29 58.13 L 52.42 58.34 L 52.57 58.32 L 52.45 58.20 L 52.56 58.12 L 52.80 58.08 L 52.60 57.96 L 52.71 57.86 L 52.34 57.93 L 52.61 57.66 L 51.86 57.65 L 52.10 57.47 L 52.09 57.35 L 51.92 57.45 L 51.89 57.34 L 52.07 57.07 L 51.91 57.08 L 52.10 56.99 L 51.87 57.00 L 51.76 56.87 L 51.58 57.04 L 51.49 56.93 L 50.76 57.39 L 50.51 57.45 L 50.60 57.33 L 50.48 57.33 L 50.06 57.53 L 50.60 57.18 L 50.82 57.22 L 50.78 57.09 L 51.30 57.05 L 51.29 56.94 L 52.09 56.62 L 52.65 56.19 Z\" /><path class=\"earthquake-japan-land\" d=\"M 54.87 53.99 L 54.87 53.99 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.79 54.01 L 55.79 54.01 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.90 54.02 L 55.90 54.02 Z\" /><path class=\"earthquake-japan-land\" d=\"M 54.96 54.03 L 54.96 54.03 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.94 54.07 L 55.94 54.07 Z\" /><path class=\"earthquake-japan-land\" d=\"M 53.51 54.25 L 53.51 54.25 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.56 54.27 L 55.56 54.27 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.52 54.29 L 55.52 54.29 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.94 54.43 L 52.94 54.43 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.47 54.46 L 55.47 54.46 Z\" /><path class=\"earthquake-japan-land\" d=\"M 53.00 54.81 L 52.89 54.69 L 53.26 54.48 L 53.21 54.74 L 53.00 54.81 Z\" /><path class=\"earthquake-japan-land\" d=\"M 56.81 54.59 L 56.81 54.59 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.70 54.72 L 52.67 54.60 L 52.82 54.57 L 52.70 54.72 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.47 54.71 L 52.61 54.60 L 52.47 54.71 Z\" /><path class=\"earthquake-japan-land\" d=\"M 53.44 54.70 L 53.44 54.70 Z\" /><path class=\"earthquake-japan-land\" d=\"M 53.82 54.67 L 53.82 54.67 Z\" /><path class=\"earthquake-japan-land\" d=\"M 53.28 54.77 L 53.30 54.66 L 53.28 54.77 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.64 54.88 L 52.77 54.83 L 52.64 54.88 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.80 54.88 L 52.80 54.88 Z\" /><path class=\"earthquake-japan-land\" d=\"M 53.34 55.13 L 53.26 55.00 L 53.50 54.88 L 53.34 55.13 Z\" /><path class=\"earthquake-japan-land\" d=\"M 53.21 55.06 L 53.21 55.06 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.65 55.25 L 52.65 55.25 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.37 55.76 L 52.37 55.76 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.74 57.03 L 51.74 57.03 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.83 57.10 L 51.83 57.10 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.71 57.36 L 51.71 57.36 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.79 57.41 L 51.79 57.41 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.60 58.10 L 52.58 58.00 L 52.60 58.10 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.82 58.07 L 51.82 58.07 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.81 58.24 L 51.70 58.15 L 51.87 58.09 L 51.81 58.24 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.39 58.12 L 52.39 58.12 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.01 58.25 L 51.97 58.16 L 52.09 58.20 L 52.01 58.25 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.34 58.24 L 51.34 58.24 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.35 58.25 L 51.35 58.25 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.85 58.27 L 51.85 58.27 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.45 58.35 L 51.30 58.26 L 51.45 58.35 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.99 58.27 L 51.99 58.27 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.98 58.35 L 51.98 58.35 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.56 58.42 L 51.43 58.37 L 51.56 58.42 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.60 58.40 L 51.72 58.37 L 51.60 58.40 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.13 58.58 L 52.13 58.58 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.06 58.63 L 52.06 58.63 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.59 58.63 L 51.68 58.61 L 51.59 58.63 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.18 59.36 L 52.29 59.32 L 52.18 59.36 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.01 59.39 L 52.01 59.39 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.15 59.41 L 52.15 59.41 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.69 59.49 L 52.69 59.49 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.82 59.50 L 52.82 59.50 Z\" /><path class=\"earthquake-japan-land\" d=\"M 68.56 50.99 L 68.78 51.24 L 69.24 51.34 L 69.45 51.32 L 69.63 51.10 L 70.07 51.33 L 70.28 51.19 L 70.43 51.47 L 70.20 51.53 L 70.36 51.65 L 70.25 51.91 L 70.57 52.06 L 70.78 52.01 L 70.84 52.18 L 71.08 52.15 L 71.15 52.30 L 71.03 52.51 L 70.48 52.57 L 70.34 52.76 L 70.65 53.11 L 70.47 53.18 L 70.66 53.40 L 70.47 53.66 L 70.57 53.82 L 70.52 54.43 L 70.09 54.38 L 69.92 54.58 L 69.63 54.63 L 69.47 54.78 L 69.54 54.92 L 69.33 54.91 L 69.36 55.19 L 69.04 54.97 L 68.78 55.07 L 68.43 54.98 L 68.09 55.13 L 68.00 54.96 L 68.18 54.59 L 67.70 54.20 L 68.24 53.55 L 68.65 53.51 L 68.37 53.27 L 68.25 52.80 L 68.43 52.50 L 68.25 52.07 L 68.41 51.89 L 68.25 51.78 L 68.56 50.99 Z\" /><path class=\"earthquake-japan-land\" d=\"M 56.24 44.72 L 56.22 44.59 L 55.91 44.49 L 55.90 44.14 L 56.02 44.18 L 56.12 43.96 L 56.41 43.87 L 56.93 44.23 L 56.85 44.52 L 56.69 44.56 L 56.72 44.44 L 56.53 44.55 L 56.70 44.68 L 56.40 44.60 L 56.24 44.72 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.61 44.79 L 55.61 44.79 Z\" /><path class=\"earthquake-japan-land\" d=\"M 54.99 45.28 L 54.73 45.16 L 54.89 44.93 L 55.46 44.82 L 55.20 44.97 L 55.22 45.18 L 55.03 45.12 L 55.03 44.97 L 54.90 45.05 L 54.99 45.28 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.85 44.85 L 55.85 44.85 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.34 45.29 L 55.32 45.00 L 55.66 44.95 L 55.59 45.07 L 55.76 45.11 L 55.48 45.13 L 55.51 45.22 L 55.34 45.29 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.83 45.00 L 55.83 45.00 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.29 45.48 L 55.03 45.44 L 55.00 45.31 L 55.36 45.40 L 55.29 45.48 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.25 45.48 L 55.25 45.48 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.39 45.49 L 55.39 45.49 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.20 45.48 L 55.20 45.48 Z\" /><path class=\"earthquake-japan-land\" d=\"M 56.22 47.50 L 55.99 47.61 L 56.60 48.15 L 56.46 48.55 L 56.55 48.78 L 55.76 49.00 L 55.97 49.23 L 55.75 49.36 L 55.70 49.66 L 55.17 49.69 L 54.95 49.54 L 54.75 49.66 L 54.36 49.54 L 53.73 50.18 L 53.42 50.22 L 53.17 50.43 L 53.50 50.54 L 53.49 50.71 L 53.08 50.71 L 52.69 50.93 L 52.17 50.82 L 51.98 51.00 L 51.58 50.90 L 51.49 51.01 L 51.20 50.88 L 51.11 51.14 L 50.65 51.33 L 50.81 51.44 L 50.58 51.76 L 50.63 51.90 L 50.24 52.17 L 50.34 52.42 L 49.98 52.60 L 50.06 52.86 L 49.79 53.15 L 49.60 53.01 L 49.10 53.17 L 48.83 52.89 L 48.97 52.56 L 48.49 52.57 L 48.34 52.25 L 48.63 51.92 L 48.45 51.45 L 49.22 51.32 L 49.32 51.11 L 49.72 50.95 L 50.04 50.60 L 50.27 50.58 L 50.56 50.21 L 51.54 49.74 L 52.08 49.13 L 53.13 48.69 L 53.37 48.30 L 53.14 48.02 L 53.75 47.97 L 53.63 47.86 L 54.32 47.67 L 54.83 47.66 L 54.84 47.53 L 55.13 47.55 L 55.24 47.37 L 55.48 47.37 L 55.44 47.26 L 55.76 47.46 L 56.08 47.36 L 56.63 47.42 L 56.22 47.50 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.63 47.33 L 55.63 47.33 Z\" /><path class=\"earthquake-japan-land\" d=\"M 56.21 47.37 L 56.21 47.37 Z\" /><path class=\"earthquake-japan-land\" d=\"M 55.26 47.43 L 55.26 47.43 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.98 49.23 L 51.98 49.23 Z\" /><path class=\"earthquake-japan-land\" d=\"M 51.99 49.23 L 51.99 49.23 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.00 49.23 L 52.00 49.23 Z\" /><path class=\"earthquake-japan-land\" d=\"M 50.22 50.45 L 50.22 50.45 Z\" /><path class=\"earthquake-japan-land\" d=\"M 50.30 50.46 L 50.30 50.46 Z\" /><path class=\"earthquake-japan-land\" d=\"M 49.20 50.76 L 49.20 50.76 Z\" /><path class=\"earthquake-japan-land\" d=\"M 49.33 39.80 L 49.33 39.80 Z\" /><path class=\"earthquake-japan-land\" d=\"M 49.35 39.81 L 49.35 39.81 Z\" /><path class=\"earthquake-japan-land\" d=\"M 49.32 39.78 L 49.32 39.78 Z\" /><path class=\"earthquake-japan-land\" d=\"M 97.91 25.57 L 97.94 25.42 L 98.42 25.22 L 99.08 26.04 L 99.17 26.27 L 98.97 26.41 L 99.38 26.62 L 99.15 26.88 L 99.77 27.34 L 99.70 27.64 L 100.02 28.29 L 99.74 29.13 L 100.13 28.84 L 100.13 29.18 L 100.36 29.32 L 100.05 29.65 L 99.77 29.69 L 99.90 29.82 L 100.19 29.62 L 100.30 29.67 L 100.22 29.88 L 99.93 29.96 L 99.88 29.88 L 99.70 30.06 L 99.79 30.19 L 99.50 30.29 L 99.99 30.22 L 99.86 30.39 L 99.44 30.44 L 99.65 30.60 L 99.45 30.57 L 99.46 30.70 L 99.86 30.69 L 99.74 30.83 L 99.35 30.88 L 99.61 31.01 L 99.19 31.15 L 99.61 31.34 L 99.41 31.43 L 99.06 31.31 L 99.11 31.47 L 99.38 31.52 L 99.07 31.56 L 99.27 31.68 L 98.67 31.73 L 98.65 31.49 L 98.55 31.71 L 98.72 31.84 L 98.56 31.83 L 98.49 31.96 L 98.64 32.03 L 98.53 32.09 L 98.34 31.79 L 98.13 31.81 L 98.16 31.95 L 97.45 31.83 L 97.46 32.20 L 97.26 32.38 L 97.19 32.80 L 97.05 32.87 L 96.97 32.73 L 96.55 32.62 L 96.52 32.76 L 96.08 32.96 L 95.53 32.62 L 95.70 32.37 L 94.93 32.38 L 94.13 31.98 L 93.87 32.01 L 93.82 31.82 L 94.05 31.56 L 93.76 31.42 L 93.85 31.25 L 93.75 31.18 L 94.04 31.00 L 93.83 30.92 L 93.94 30.74 L 93.47 30.45 L 93.55 30.32 L 93.29 29.93 L 93.62 29.63 L 93.65 29.24 L 94.11 28.86 L 94.11 28.69 L 93.87 28.48 L 94.24 28.20 L 93.94 28.07 L 93.92 27.88 L 94.39 27.84 L 94.22 26.94 L 94.40 26.78 L 94.30 26.48 L 94.48 26.30 L 94.78 26.14 L 95.13 26.26 L 95.52 26.11 L 95.50 25.99 L 96.59 25.58 L 96.76 25.77 L 97.22 25.56 L 97.69 25.69 L 97.91 25.57 Z\" /><path class=\"earthquake-japan-land\" d=\"M 99.94 28.78 L 99.94 28.78 Z\" /><path class=\"earthquake-japan-land\" d=\"M 100.19 29.91 L 100.19 29.91 Z\" /><path class=\"earthquake-japan-land\" d=\"M 99.98 30.00 L 99.98 30.00 Z\" /><path class=\"earthquake-japan-land\" d=\"M 99.93 30.44 L 99.93 30.44 Z\" /><path class=\"earthquake-japan-land\" d=\"M 98.55 32.10 L 98.55 32.10 Z\" /><path class=\"earthquake-japan-land\" d=\"M 61.85 47.21 L 62.10 47.44 L 62.06 47.66 L 62.20 47.99 L 62.40 48.07 L 62.36 48.28 L 62.57 48.39 L 62.57 48.74 L 62.31 48.92 L 61.97 48.85 L 61.60 49.08 L 61.30 49.04 L 60.86 49.23 L 60.69 48.73 L 60.05 48.60 L 60.07 48.41 L 59.66 48.48 L 59.15 48.87 L 58.73 48.55 L 57.98 48.43 L 57.80 48.88 L 57.53 48.96 L 57.63 49.17 L 56.98 49.18 L 57.01 49.48 L 56.49 49.53 L 56.34 49.74 L 56.23 49.64 L 55.68 49.68 L 55.75 49.36 L 55.97 49.23 L 55.76 49.00 L 56.55 48.78 L 56.46 48.55 L 56.60 48.15 L 56.11 47.81 L 55.99 47.61 L 56.00 47.57 L 56.09 47.52 L 56.32 47.49 L 56.22 47.57 L 56.32 47.74 L 56.97 47.94 L 57.84 47.59 L 58.86 47.72 L 60.04 47.55 L 60.39 47.63 L 61.23 47.49 L 61.85 47.21 Z\" /><path class=\"earthquake-japan-land\" d=\"M 62.96 53.57 L 63.06 53.41 L 62.96 53.57 Z\" /><path class=\"earthquake-japan-land\" d=\"M 63.11 53.70 L 62.94 53.60 L 63.21 53.46 L 63.11 53.70 Z\" /><path class=\"earthquake-japan-land\" d=\"M 62.20 53.60 L 62.92 53.46 L 62.91 53.62 L 63.21 53.73 L 63.02 54.00 L 62.94 54.49 L 63.03 54.62 L 63.17 54.50 L 63.53 54.88 L 63.14 55.19 L 63.75 55.30 L 62.90 55.59 L 62.58 55.90 L 61.98 56.11 L 61.82 56.41 L 61.66 56.43 L 61.81 56.45 L 61.55 56.47 L 61.57 56.61 L 60.96 56.54 L 60.75 56.23 L 60.92 56.14 L 60.87 55.98 L 60.29 55.95 L 60.16 55.33 L 59.80 55.30 L 59.57 55.49 L 59.19 55.25 L 58.73 55.29 L 58.32 55.14 L 58.45 54.93 L 58.40 54.49 L 58.89 54.19 L 59.69 54.02 L 59.98 54.21 L 60.25 54.01 L 60.61 54.01 L 60.87 53.74 L 61.75 53.70 L 62.06 53.83 L 62.20 53.60 Z\" /><path class=\"earthquake-japan-land\" d=\"M 63.37 55.18 L 63.37 55.18 Z\" /><path class=\"earthquake-japan-land\" d=\"M 63.27 55.21 L 63.27 55.21 Z\" /><path class=\"earthquake-japan-land\" d=\"M 63.55 55.21 L 63.55 55.21 Z\" /><path class=\"earthquake-japan-land\" d=\"M 64.05 55.27 L 64.11 55.20 L 64.05 55.27 Z\" /><path class=\"earthquake-japan-land\" d=\"M 63.65 55.24 L 63.65 55.24 Z\" /><path class=\"earthquake-japan-land\" d=\"M 63.99 55.26 L 63.99 55.26 Z\" /><path class=\"earthquake-japan-land\" d=\"M 64.02 55.28 L 64.02 55.28 Z\" /><path class=\"earthquake-japan-land\" d=\"M 62.48 56.23 L 62.42 56.16 L 62.48 56.23 Z\" /><path class=\"earthquake-japan-land\" d=\"M 62.25 56.19 L 62.25 56.19 Z\" /><path class=\"earthquake-japan-land\" d=\"M 62.12 56.23 L 62.12 56.23 Z\" /><path class=\"earthquake-japan-land\" d=\"M 61.60 56.64 L 61.60 56.64 Z\" /><path class=\"earthquake-japan-land\" d=\"M 41.07 62.50 L 41.10 62.31 L 41.28 62.24 L 41.34 62.36 L 41.07 62.50 Z\" /><path class=\"earthquake-japan-land\" d=\"M 40.85 62.61 L 40.94 62.42 L 40.85 62.61 Z\" /><path class=\"earthquake-japan-land\" d=\"M 40.90 62.45 L 40.90 62.45 Z\" /><path class=\"earthquake-japan-land\" d=\"M 41.14 62.52 L 41.14 62.52 Z\" /><path class=\"earthquake-japan-land\" d=\"M 40.91 62.54 L 40.91 62.54 Z\" /><path class=\"earthquake-japan-land\" d=\"M 41.02 62.71 L 40.97 62.53 L 41.02 62.71 Z\" /><path class=\"earthquake-japan-land\" d=\"M 40.79 63.23 L 40.45 62.82 L 40.61 62.73 L 40.53 62.66 L 40.78 62.75 L 40.72 62.65 L 40.87 62.59 L 41.00 62.74 L 40.92 62.89 L 41.04 62.93 L 40.79 63.23 Z\" /><path class=\"earthquake-japan-land\" d=\"M 40.89 62.61 L 40.89 62.61 Z\" /><path class=\"earthquake-japan-land\" d=\"M 41.08 62.62 L 41.08 62.62 Z\" /><path class=\"earthquake-japan-land\" d=\"M 42.95 62.79 L 43.60 63.18 L 43.51 63.37 L 43.89 63.57 L 44.00 63.87 L 44.33 63.94 L 44.56 64.16 L 44.38 64.48 L 44.93 64.64 L 44.89 64.76 L 45.07 64.78 L 45.27 65.30 L 45.39 65.18 L 45.64 65.33 L 45.82 65.28 L 46.02 65.55 L 45.80 66.08 L 45.54 66.02 L 45.09 66.40 L 45.09 66.56 L 45.54 66.68 L 45.39 66.94 L 45.63 66.93 L 45.33 67.15 L 45.08 67.15 L 44.80 67.56 L 43.73 67.91 L 43.30 68.21 L 43.39 67.94 L 43.26 67.87 L 43.73 67.55 L 44.01 66.65 L 43.78 66.27 L 43.49 66.08 L 43.49 65.66 L 43.18 65.70 L 42.95 65.52 L 43.39 65.32 L 43.58 65.44 L 43.53 65.65 L 43.82 65.63 L 44.11 65.20 L 43.97 64.99 L 43.43 64.84 L 43.14 64.94 L 42.59 65.89 L 42.65 65.98 L 42.57 65.94 L 42.85 66.76 L 43.33 66.97 L 43.20 67.31 L 42.93 67.47 L 42.60 67.43 L 42.31 67.05 L 41.45 66.96 L 41.38 67.06 L 41.07 67.05 L 41.14 66.91 L 41.00 66.83 L 41.12 66.77 L 40.87 66.71 L 41.04 66.61 L 40.53 66.31 L 40.79 66.18 L 41.12 66.37 L 41.36 66.25 L 41.66 65.66 L 41.57 65.19 L 41.26 64.86 L 40.93 64.78 L 40.83 64.57 L 41.12 64.04 L 41.00 63.70 L 40.86 63.67 L 41.03 63.37 L 40.87 63.16 L 41.12 63.05 L 41.54 63.15 L 41.80 62.87 L 42.02 63.09 L 42.27 63.12 L 42.91 62.93 L 42.95 62.79 Z\" /><path class=\"earthquake-japan-land\" d=\"M 40.78 63.25 L 40.78 63.25 Z\" /><path class=\"earthquake-japan-land\" d=\"M 40.80 63.49 L 40.80 63.49 Z\" /><path class=\"earthquake-japan-land\" d=\"M 40.82 63.54 L 40.82 63.54 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.36 64.54 L 39.21 64.32 L 39.32 64.28 L 39.10 64.35 L 39.17 64.17 L 39.55 64.35 L 39.54 64.23 L 39.65 64.25 L 39.63 64.45 L 39.36 64.54 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.65 64.24 L 39.65 64.24 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.79 64.25 L 39.79 64.25 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.88 64.27 L 39.88 64.27 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.20 64.45 L 39.20 64.45 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.14 64.66 L 39.05 64.55 L 39.19 64.46 L 39.14 64.66 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.56 65.36 L 38.29 65.19 L 38.99 64.61 L 38.56 65.36 Z\" /><path class=\"earthquake-japan-land\" d=\"M 43.57 65.00 L 43.57 65.00 Z\" /><path class=\"earthquake-japan-land\" d=\"M 43.60 65.39 L 43.60 65.39 Z\" /><path class=\"earthquake-japan-land\" d=\"M 45.59 66.25 L 45.59 66.25 Z\" /><path class=\"earthquake-japan-land\" d=\"M 45.12 66.53 L 45.12 66.53 Z\" /><path class=\"earthquake-japan-land\" d=\"M 40.81 66.59 L 40.81 66.59 Z\" /><path class=\"earthquake-japan-land\" d=\"M 43.38 66.94 L 43.38 66.94 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.38 67.29 L 37.38 67.29 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.17 67.38 L 37.25 67.28 L 37.17 67.38 Z\" /><path class=\"earthquake-japan-land\" d=\"M 43.36 68.20 L 43.36 68.20 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.34 68.82 L 37.34 68.82 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.65 69.04 L 39.52 68.92 L 39.81 68.93 L 39.65 69.04 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.14 68.91 L 37.14 68.91 Z\" /><path class=\"earthquake-japan-land\" d=\"M 44.74 69.84 L 44.70 69.68 L 45.28 68.91 L 45.39 69.56 L 45.17 70.15 L 44.81 70.55 L 44.90 70.92 L 44.36 71.16 L 44.25 70.60 L 44.64 70.25 L 44.74 69.84 Z\" /><path class=\"earthquake-japan-land\" d=\"M 42.21 69.09 L 41.98 69.05 L 42.21 69.09 Z\" /><path class=\"earthquake-japan-land\" d=\"M 41.39 69.22 L 41.34 69.12 L 41.60 69.11 L 41.39 69.22 Z\" /><path class=\"earthquake-japan-land\" d=\"M 41.69 69.08 L 41.69 69.08 Z\" /><path class=\"earthquake-japan-land\" d=\"M 44.25 69.43 L 44.28 69.25 L 44.25 69.43 Z\" /><path class=\"earthquake-japan-land\" d=\"M 41.05 70.81 L 40.72 70.50 L 41.32 70.69 L 41.05 70.81 Z\" /><path class=\"earthquake-japan-land\" d=\"M 42.61 71.70 L 42.18 71.64 L 41.88 71.03 L 42.48 70.60 L 43.35 71.03 L 43.25 71.38 L 42.61 71.70 Z\" /><path class=\"earthquake-japan-land\" d=\"M 44.84 70.82 L 44.84 70.82 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.65 72.96 L 39.50 72.84 L 39.57 72.70 L 39.65 72.96 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.71 73.22 L 37.65 73.12 L 37.71 73.22 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.10 73.29 L 38.10 73.29 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.36 73.56 L 39.18 73.41 L 39.25 73.26 L 39.45 73.32 L 39.58 73.55 L 39.36 73.56 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.68 74.20 L 37.67 74.11 L 37.68 74.20 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.53 74.54 L 38.42 74.30 L 38.71 74.23 L 38.53 74.54 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.02 75.25 L 37.97 75.11 L 38.02 75.25 Z\" /><path class=\"earthquake-japan-land\" d=\"M 36.71 76.25 L 36.71 76.25 Z\" /><path class=\"earthquake-japan-land\" d=\"M 36.63 76.28 L 36.63 76.28 Z\" /><path class=\"earthquake-japan-land\" d=\"M 36.10 76.70 L 35.93 76.57 L 36.09 76.56 L 36.10 76.70 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.00 78.06 L 35.00 78.06 Z\" /><path class=\"earthquake-japan-land\" d=\"M 34.97 78.22 L 34.86 78.18 L 34.97 78.22 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.23 79.85 L 38.24 79.69 L 38.33 79.83 L 38.37 79.72 L 38.23 79.53 L 38.44 79.41 L 38.61 79.74 L 38.54 79.91 L 38.07 80.00 L 37.67 80.33 L 37.71 80.41 L 37.31 80.47 L 37.21 80.70 L 37.03 80.69 L 37.37 80.87 L 37.01 80.95 L 37.00 81.12 L 36.68 81.05 L 36.88 81.32 L 36.47 81.14 L 36.40 80.92 L 36.31 80.99 L 36.46 80.81 L 36.27 80.76 L 36.23 80.90 L 35.67 80.66 L 36.36 80.63 L 36.46 80.53 L 36.24 80.57 L 36.05 80.43 L 36.51 80.32 L 36.69 80.15 L 36.99 80.20 L 36.97 80.07 L 37.25 80.08 L 37.31 79.94 L 37.48 80.09 L 37.72 79.72 L 38.11 79.65 L 37.95 79.94 L 38.10 79.77 L 38.11 79.93 L 38.23 79.85 Z\" /><path class=\"earthquake-japan-land\" d=\"M 39.72 80.57 L 39.59 80.37 L 40.15 80.13 L 39.72 80.57 Z\" /><path class=\"earthquake-japan-land\" d=\"M 36.04 80.54 L 35.92 80.43 L 36.04 80.54 Z\" /><path class=\"earthquake-japan-land\" d=\"M 36.59 81.54 L 36.61 81.39 L 36.42 81.53 L 36.26 81.32 L 36.08 81.47 L 36.09 81.19 L 35.87 80.97 L 36.19 80.94 L 36.01 81.00 L 36.19 81.13 L 36.34 81.06 L 36.22 81.27 L 36.37 81.18 L 36.30 81.29 L 36.72 81.29 L 36.59 81.54 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.85 80.95 L 35.85 80.95 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.75 81.24 L 35.75 81.24 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.87 81.32 L 35.80 81.26 L 35.87 81.32 Z\" /><path class=\"earthquake-japan-land\" d=\"M 35.74 81.76 L 35.85 81.51 L 35.74 81.76 Z\" /><path class=\"earthquake-japan-land\" d=\"M 36.28 81.80 L 36.06 81.72 L 36.06 81.57 L 36.33 81.66 L 36.28 81.80 Z\" /><path class=\"earthquake-japan-land\" d=\"M 36.38 81.73 L 36.38 81.73 Z\" /><path class=\"earthquake-japan-land\" d=\"M 36.27 81.81 L 36.27 81.81 Z\" /><path class=\"earthquake-japan-land\" d=\"M 34.51 82.94 L 34.44 82.36 L 34.85 82.31 L 34.84 82.65 L 35.18 82.86 L 35.10 83.10 L 34.93 83.32 L 34.68 83.36 L 34.41 83.09 L 34.51 82.94 Z\" /><path class=\"earthquake-japan-land\" d=\"M 32.88 84.54 L 33.56 84.39 L 32.78 84.87 L 32.61 84.60 L 32.88 84.54 Z\" /><path class=\"earthquake-japan-land\" d=\"M 32.21 86.28 L 31.98 86.14 L 32.19 86.07 L 32.21 86.28 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.70 66.78 L 38.70 66.78 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.09 67.40 L 37.09 67.40 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.12 67.56 L 37.12 67.56 Z\" /><path class=\"earthquake-japan-land\" d=\"M 38.70 66.79 L 38.70 66.79 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.08 67.40 L 37.08 67.40 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.13 68.95 L 37.13 68.95 Z\" /><path class=\"earthquake-japan-land\" d=\"M 37.13 68.92 L 37.13 68.92 Z\" /><path class=\"earthquake-japan-land\" d=\"M 87.74 33.85 L 88.61 34.11 L 88.53 34.58 L 89.24 34.80 L 89.50 35.11 L 88.93 35.49 L 88.56 35.42 L 88.41 35.59 L 88.36 36.01 L 88.46 36.10 L 88.28 36.21 L 88.12 36.73 L 88.29 36.98 L 88.71 37.19 L 88.29 37.48 L 88.14 37.78 L 87.75 37.96 L 87.93 38.58 L 87.14 38.57 L 86.99 38.82 L 86.12 38.87 L 85.99 39.04 L 86.16 39.15 L 86.17 39.35 L 85.82 39.83 L 86.27 40.16 L 86.20 41.18 L 85.90 41.07 L 85.49 40.64 L 85.23 40.97 L 84.83 41.01 L 84.90 41.40 L 84.62 41.44 L 84.64 41.67 L 84.11 41.74 L 84.10 41.98 L 83.95 42.07 L 83.63 41.98 L 83.51 42.11 L 83.35 41.93 L 83.45 41.56 L 82.95 41.30 L 82.83 40.81 L 82.57 40.77 L 81.97 40.92 L 81.72 41.27 L 81.49 41.30 L 81.44 41.60 L 81.07 41.50 L 80.58 41.59 L 80.26 41.82 L 80.02 41.70 L 80.16 41.46 L 80.07 41.35 L 79.34 41.29 L 79.38 41.51 L 78.81 41.97 L 78.55 41.16 L 78.17 41.00 L 79.54 40.64 L 80.51 40.12 L 81.08 40.14 L 81.28 39.97 L 81.25 40.08 L 82.18 39.44 L 82.77 39.19 L 83.09 38.71 L 83.73 38.16 L 84.20 37.21 L 85.35 36.58 L 86.15 36.39 L 86.86 35.88 L 87.25 35.28 L 87.29 34.56 L 87.74 33.85 Z\" /><path class=\"earthquake-japan-land\" d=\"M 86.11 34.38 L 86.33 34.14 L 86.11 34.38 Z\" /><path class=\"earthquake-japan-land\" d=\"M 82.42 34.85 L 82.42 34.85 Z\" /><path class=\"earthquake-japan-land\" d=\"M 81.22 37.26 L 81.03 37.15 L 81.36 37.04 L 81.42 36.73 L 81.72 36.53 L 81.51 36.33 L 81.27 36.52 L 81.14 36.46 L 81.21 35.97 L 81.63 35.46 L 82.19 35.16 L 82.29 34.90 L 82.57 34.85 L 82.46 35.44 L 82.17 35.97 L 82.41 36.08 L 82.81 35.96 L 82.73 36.33 L 82.35 36.83 L 81.22 37.26 Z\" /><path class=\"earthquake-japan-land\" d=\"M 81.20 35.98 L 81.20 35.98 Z\" /><path class=\"earthquake-japan-land\" d=\"M 86.25 34.11 L 86.25 34.11 Z\" /><path class=\"earthquake-japan-land\" d=\"M 57.91 55.15 L 58.23 55.08 L 58.73 55.29 L 59.19 55.25 L 59.57 55.49 L 59.80 55.30 L 60.16 55.33 L 60.29 55.95 L 60.87 55.98 L 60.92 56.14 L 60.75 56.23 L 60.96 56.54 L 61.53 56.58 L 61.04 57.30 L 60.88 57.98 L 59.67 56.88 L 58.65 56.65 L 57.82 56.81 L 57.80 56.58 L 57.73 56.74 L 57.87 56.84 L 56.75 57.20 L 57.01 57.21 L 57.08 57.10 L 57.29 57.18 L 56.71 57.28 L 56.59 57.48 L 56.44 57.25 L 56.15 57.62 L 56.30 57.68 L 56.19 57.75 L 56.31 57.92 L 56.05 58.26 L 56.11 58.39 L 55.85 58.41 L 55.47 58.98 L 55.20 58.92 L 55.06 59.02 L 55.04 59.63 L 54.74 59.74 L 55.10 60.35 L 54.83 60.32 L 54.85 60.10 L 54.73 60.16 L 54.68 60.06 L 54.40 60.05 L 54.34 60.16 L 54.31 60.04 L 54.01 60.24 L 53.55 60.01 L 53.14 60.16 L 53.36 59.81 L 53.28 59.76 L 53.60 59.63 L 53.54 59.43 L 53.27 59.43 L 53.45 59.21 L 53.09 58.27 L 53.48 58.46 L 53.87 58.15 L 53.97 57.84 L 54.50 57.63 L 54.03 57.00 L 55.07 56.91 L 55.32 56.62 L 55.23 56.48 L 55.39 56.32 L 55.38 56.12 L 55.58 56.09 L 55.97 55.48 L 56.18 55.53 L 56.38 55.31 L 57.48 55.32 L 57.70 55.10 L 57.91 55.15 Z\" /><path class=\"earthquake-japan-land\" d=\"M 61.48 56.65 L 61.48 56.65 Z\" /><path class=\"earthquake-japan-land\" d=\"M 61.56 56.65 L 61.56 56.65 Z\" /><path class=\"earthquake-japan-land\" d=\"M 56.51 57.47 L 56.51 57.47 Z\" /><path class=\"earthquake-japan-land\" d=\"M 56.55 57.47 L 56.55 57.47 Z\" /><path class=\"earthquake-japan-land\" d=\"M 56.61 57.51 L 56.61 57.51 Z\" /><path class=\"earthquake-japan-land\" d=\"M 53.52 59.46 L 53.52 59.46 Z\" /><path class=\"earthquake-japan-land\" d=\"M 53.32 59.47 L 53.32 59.47 Z\" /><path class=\"earthquake-japan-land\" d=\"M 53.28 59.48 L 53.28 59.48 Z\" /><path class=\"earthquake-japan-land\" d=\"M 53.48 59.50 L 53.48 59.50 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.41 60.02 L 52.49 59.98 L 52.41 60.02 Z\" /><path class=\"earthquake-japan-land\" d=\"M 53.09 60.16 L 53.09 60.16 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.71 60.44 L 52.72 60.21 L 52.86 60.38 L 52.71 60.44 Z\" /><path class=\"earthquake-japan-land\" d=\"M 53.01 60.25 L 53.01 60.25 Z\" /><path class=\"earthquake-japan-land\" d=\"M 52.42 60.30 L 52.42 60.30 Z\" /><path class=\"earthquake-japan-land\" d=\"M 47.54 60.12 L 47.83 60.21 L 48.54 60.13 L 48.68 59.85 L 48.84 59.83 L 49.29 59.90 L 49.24 60.29 L 49.43 60.25 L 49.25 60.48 L 49.13 60.43 L 48.89 60.57 L 48.77 60.90 L 48.47 61.06 L 48.42 61.33 L 48.57 61.27 L 48.64 61.40 L 48.47 61.50 L 48.29 61.44 L 48.21 61.64 L 48.37 61.57 L 48.27 61.70 L 48.44 61.72 L 48.21 61.79 L 47.92 62.33 L 47.32 64.03 L 47.41 64.00 L 47.27 64.46 L 47.44 64.61 L 47.25 65.09 L 47.34 65.25 L 46.91 65.66 L 46.94 65.98 L 46.81 66.05 L 46.68 66.54 L 46.54 66.41 L 46.28 66.45 L 46.21 66.24 L 45.80 66.09 L 45.99 65.84 L 45.94 65.35 L 45.39 65.18 L 45.27 65.30 L 45.07 64.78 L 44.89 64.76 L 44.93 64.64 L 44.38 64.48 L 44.56 64.16 L 44.33 63.94 L 44.00 63.87 L 43.89 63.57 L 43.52 63.28 L 43.67 63.14 L 44.10 63.21 L 44.52 63.03 L 44.86 63.09 L 45.06 62.85 L 45.54 62.91 L 45.21 62.50 L 45.55 62.14 L 45.09 61.64 L 45.09 61.14 L 45.25 60.97 L 45.54 60.99 L 45.58 60.71 L 46.17 60.25 L 46.32 59.88 L 46.70 59.85 L 46.83 59.98 L 47.37 59.83 L 47.58 60.00 L 47.54 60.12 Z\" /><path class=\"earthquake-japan-land\" d=\"M 49.22 60.54 L 49.22 60.54 Z\" /><path class=\"earthquake-japan-land\" d=\"M 49.12 60.66 L 49.04 60.59 L 49.12 60.66 Z\" /><path class=\"earthquake-japan-land\" d=\"M 49.11 60.67 L 49.11 60.67 Z\" /><path class=\"earthquake-japan-land\" d=\"M 48.51 61.49 L 48.51 61.49 Z\" /><path class=\"earthquake-japan-land\" d=\"M 48.33 61.53 L 48.33 61.53 Z\" /><path class=\"earthquake-japan-land\" d=\"M 48.65 61.53 L 48.65 61.53 Z\" /><path class=\"earthquake-japan-land\" d=\"M 47.36 64.83 L 47.36 64.83 Z\" /><path class=\"earthquake-japan-land\" d=\"M 47.09 65.86 L 47.04 65.72 L 47.09 65.86 Z\" /><path class=\"earthquake-japan-land\" d=\"M 46.94 65.90 L 46.94 65.90 Z\" /><path class=\"earthquake-japan-land\" d=\"M 46.95 66.03 L 46.95 66.03 Z\" /><path class=\"earthquake-japan-land\" d=\"M 46.89 66.14 L 46.89 66.14 Z\" /><path class=\"earthquake-japan-land\" d=\"M 85.65 46.95 L 86.08 47.06 L 86.26 47.26 L 86.99 47.34 L 87.34 47.72 L 87.37 47.38 L 87.54 47.38 L 87.25 47.22 L 87.48 47.25 L 87.63 47.08 L 88.33 47.32 L 88.51 47.56 L 88.95 47.61 L 88.88 47.68 L 88.76 47.58 L 88.82 47.67 L 88.63 47.65 L 88.66 47.73 L 88.16 47.88 L 88.45 48.00 L 88.35 48.17 L 88.11 48.20 L 88.28 48.31 L 88.28 48.45 L 88.11 48.49 L 88.30 48.51 L 88.17 48.66 L 88.36 48.63 L 88.45 48.79 L 88.73 48.85 L 88.59 48.88 L 88.63 49.04 L 88.28 49.16 L 88.39 49.37 L 88.05 49.36 L 88.13 49.26 L 88.00 49.11 L 88.14 49.02 L 87.88 48.85 L 87.85 48.67 L 87.19 48.55 L 86.23 48.67 L 85.74 48.91 L 85.69 49.19 L 85.80 49.36 L 85.14 49.32 L 84.88 48.93 L 85.09 48.50 L 85.01 48.19 L 84.59 48.14 L 84.69 47.96 L 85.56 47.56 L 85.65 46.95 Z\" /><path class=\"earthquake-japan-land\" d=\"M 88.73 47.80 L 88.89 47.71 L 88.73 47.80 Z\" /><path class=\"earthquake-japan-land\" d=\"M 88.57 47.79 L 88.71 47.83 L 88.56 47.89 L 88.57 47.79 Z\" /><path class=\"earthquake-japan-land\" d=\"M 88.26 47.89 L 88.26 47.89 Z\" /><path class=\"earthquake-japan-land\" d=\"M 88.48 47.96 L 88.36 47.89 L 88.48 47.96 Z\" /><path class=\"earthquake-japan-land\" d=\"M 88.22 47.95 L 88.22 47.95 Z\" /><path class=\"earthquake-japan-land\" d=\"M 88.37 48.18 L 88.46 48.14 L 88.37 48.18 Z\" /><path class=\"earthquake-japan-land\" d=\"M 88.46 48.18 L 88.46 48.18 Z\" /><path class=\"earthquake-japan-land\" d=\"M 88.22 48.48 L 88.22 48.48 Z\" /><path class=\"earthquake-japan-land\" d=\"M 88.25 48.66 L 88.25 48.66 Z\" /><path class=\"earthquake-japan-land\" d=\"M 88.15 49.42 L 88.05 49.38 L 88.15 49.42 Z\" /></svg>";
  function escapeHtml(value){
    return String(value == null ? '' : value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }
  function scaleLabel(scale){
    const labels = {10:'1',20:'2',30:'3',40:'4',45:'5弱',50:'5強',55:'6弱',60:'6強',70:'7'};
    return labels[Number(scale)] || '—';
  }
  function colorForScale(scale){
    const n = Number(scale) || 0;
    if(n >= 70) return '#7e22ce';
    if(n >= 60) return '#b91c1c';
    if(n >= 50) return '#ef4444';
    if(n >= 45) return '#f97316';
    if(n >= 40) return '#f59e0b';
    if(n >= 30) return '#eab308';
    if(n >= 20) return '#22c55e';
    return '#3b82f6';
  }
  function projectCoordinates(lat, lng){
    const latitude = Number(lat), longitude = Number(lng);
    if(!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    const x = ((longitude - 122) / 24) * 100;
    const y = ((46 - latitude) / 22) * 100;
    if(x < -4 || x > 104 || y < -4 || y > 104) return null;
    return { x: Math.max(2, Math.min(98, x)), y: Math.max(2, Math.min(98, y)) };
  }
  function displayTime(time){
    const date = new Date(time);
    if(Number.isNaN(date.getTime())) return escapeHtml(String(time || '時刻不明'));
    return date.toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
  }
  function latestHtml(q){
    if(!q){
      return '<p class="earthquake-loading">地震情報を読み込んでいます。</p>';
    }
    const scale = scaleLabel(q.maxScale);
    const color = colorForScale(q.maxScale);
    const tsunami = q.tsunami === 'None' ? '津波の心配なし' : q.tsunami === 'Watch' ? '津波注意報' : q.tsunami === 'Warning' ? '津波警報' : '津波情報を確認中';
    return `<div class="earthquake-intensity" style="--event-color:${color}"><small>最大震度</small><b>${scale}</b></div>
      <p class="earthquake-place">${escapeHtml(q.place || '震源不明')}</p>
      <p class="earthquake-time">発生 ${displayTime(q.time)}</p>
      <div class="earthquake-stat-grid">
        <div class="earthquake-stat"><span>マグニチュード</span><strong>${q.mag != null ? 'M' + escapeHtml(q.mag) : '—'}</strong></div>
        <div class="earthquake-stat"><span>深さ</span><strong>${q.depth != null ? escapeHtml(q.depth) + ' km' : '—'}</strong></div>
      </div>
      <p class="earthquake-time" style="margin-top:13px">${escapeHtml(tsunami)}</p>`;
  }
  function getEvents(){
    const inJapan = q => (q.lat == null || q.lng == null) || (q.lat >= 24 && q.lat <= 46 && q.lng >= 122 && q.lng <= 146);
    return (typeof QUAKES !== 'undefined' && Array.isArray(QUAKES)) ? QUAKES.filter(q => q && q.time && inJapan(q)).slice(0, 30) : [];
  }
  function showEvent(q){
    monitorState.selected = q || null;
    const target = document.getElementById('earthquakeMonitorLatest');
    if(target) target.innerHTML = latestHtml(monitorState.selected);
    const status = document.getElementById('earthquakeDataStatus');
    if(status && q) status.textContent = '選択中: ' + displayTime(q.time) + ' 発生';
  }
  let eqLeafMap = null, eqLeafLayer = null, eqLeafRetry = 0;
  function renderMap(events){
    const el = document.getElementById('earthquakeMonitorMap');
    if(!el) return;
    if(typeof L === 'undefined'){
      if(isMapPageActive()) ensureLeaflet().then(() => renderMap(events));
      return;
    }
    if(!eqLeafMap){
      el.innerHTML = '';
      el.classList.add('is-leaflet');
      eqLeafMap = L.map(el, { scrollWheelZoom:false, zoomControl:true, attributionControl:true }).setView([37.6, 137.5], 4);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 13, minZoom: 3, attribution: '&copy; OpenStreetMap'
      }).addTo(eqLeafMap);
      eqLeafLayer = L.layerGroup().addTo(eqLeafMap);
      setTimeout(() => { try{ eqLeafMap.invalidateSize(); }catch(_){ } }, 250);
      window.addEventListener('resize', () => { try{ eqLeafMap.invalidateSize(); }catch(_){ } });
    }
    eqLeafLayer.clearLayers();
    events.forEach((q, index) => {
      const lat = Number(q.lat), lng = Number(q.lng);
      if(!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const color = colorForScale(q.maxScale);
      const marker = L.circleMarker([lat, lng], {
        radius: Math.min(16, 6 + (Number(q.maxScale || 10) / 10)),
        color: '#ffffff', weight: 2, fillColor: color, fillOpacity: index === 0 ? .95 : .7
      });
      marker.bindTooltip(`${escapeHtml(q.place || '震源不明')} / 最大震度 ${scaleLabel(q.maxScale)}`, { direction:'top' });
      marker.on('click', () => showEvent(q));
      marker.addTo(eqLeafLayer);
    });
    try{ eqLeafMap.invalidateSize(); }catch(_){ }
  }
  function renderList(events){
    const list = document.getElementById('earthquakeMonitorList');
    if(!list) return;
    const firstFive = events.slice(0, 5);
    if(!firstFive.length){
      list.innerHTML = '<div class="earthquake-empty-state">地震情報を取得できませんでした。更新ボタンで再試行できます。</div>';
      return;
    }
    list.innerHTML = '';
    firstFive.forEach(q => {
      const color = colorForScale(q.maxScale);
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'earthquake-recent-item';
      item.style.setProperty('--event-color', color);
      item.innerHTML = `<span class="earthquake-recent-top"><span>${displayTime(q.time)}</span><span class="earthquake-recent-level">震度 ${scaleLabel(q.maxScale)}</span></span><strong>${escapeHtml(q.place || '震源不明')}</strong><small>${q.mag != null ? 'M' + escapeHtml(q.mag) : '規模不明'}${q.depth != null ? ' ・ ' + escapeHtml(q.depth) + ' km' : ''}</small>`;
      item.addEventListener('click', () => showEvent(q));
      list.appendChild(item);
    });
  }
  window.renderEarthquakeMonitor = function(){
    const events = getEvents();
    renderMap(events);
    const selectedIsPresent = monitorState.selected && events.some(q => q.time === monitorState.selected.time && q.place === monitorState.selected.place);
    showEvent(selectedIsPresent ? monitorState.selected : (events[0] || null));
    renderList(events);
    const status = document.getElementById('earthquakeDataStatus');
    if(status && !events.length) status.textContent = 'データを待機しています。数秒後に自動更新されます。';
    if(status && events.length) status.textContent = `${events.length}件を表示中。最新取得 ${new Date().toLocaleTimeString('ja-JP')}`;
  };
  window.refreshEarthquakeMonitor = function(){
    const status = document.getElementById('earthquakeDataStatus');
    if(status) status.textContent = '最新データを確認しています…';
    if(typeof fetchQuakes === 'function') fetchQuakes(true);
    else window.renderEarthquakeMonitor();
  };
  window.toggleEarthquakeTheme = function(){
    if(typeof window.toggleTheme === 'function') window.toggleTheme();
    else document.body.classList.toggle('dark-mode');
  };
  window.renderEarthquakeMonitor();
})();

;

(function(){
  const iconPaths={
    '📰':'<path d="M4 4h16v16H4z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7 8h10M7 12h10M7 16h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    '📢':'<path d="M4 10v4h3l7 4V6l-7 4H4zM17 10c1.4 1 1.4 3 0 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M7 14l1 5h2l-1-5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    '🕒':'<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    '🌓':'<path d="M12 3a9 9 0 1 0 0 18 7 7 0 0 1 0-18z" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    '⚡':'<path d="M13 2 5 13h6l-1 9 8-12h-6l1-8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    '🔴':'<circle cx="12" cy="12" r="7.5" fill="currentColor"/>',
    '🔍':'<circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m15 15 5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    '↗':'<path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    '▶':'<path d="m8 5 11 7-11 7z" fill="currentColor"/>',
    '✖':'<path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    '›':'<path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
  };
  const known=Object.keys(iconPaths).map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'); const re=new RegExp('(?:'+known+'|[\\p{Extended_Pictographic}\\uFE0F\\u{1F000}-\\u{1FAFF}\\u{1FC00}-\\u{1FFFF}\\u{2300}-\\u{23FF}\\u{2600}-\\u{27BF}](?:\\uFE0F|\\u200D[\\p{Extended_Pictographic}\\uFE0F])*)','gu');
  function svgEmoji(ch){return '<span class="svg-emoji" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">'+iconPaths[ch]+'</svg></span>';}
  function convert(root){
    if(!root||root.nodeType!==1) return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(n){const p=n.parentElement;if(!p||['SCRIPT','STYLE','TEXTAREA','INPUT','OPTION'].includes(p.tagName)||p.closest('.svg-emoji'))return NodeFilter.FILTER_REJECT;re.lastIndex=0; return re.test(n.nodeValue)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;}});
    const nodes=[];let n;while(n=walker.nextNode())nodes.push(n);
    nodes.forEach(node=>{const frag=document.createDocumentFragment();let last=0;node.nodeValue.replace(re,(m,offset)=>{frag.append(document.createTextNode(node.nodeValue.slice(last,offset)));const span=document.createElement('span');span.className='svg-emoji';span.setAttribute('aria-hidden','true');span.innerHTML='<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">'+(iconPaths[m] || '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 12h8M12 8v8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>')+'</svg>';frag.append(span);last=offset+m.length;return m;});frag.append(document.createTextNode(node.nodeValue.slice(last)));node.parentNode.replaceChild(frag,node);});
  }
  function removeTerms(){
    document.querySelectorAll('#terms-page').forEach(x=>x.remove());
    document.querySelectorAll('a,button').forEach(a=>{if((a.textContent||'').replace(/\s/g,'').includes('利用規約')){const li=a.closest('li');(li||a).remove();}});
    document.querySelectorAll('h1,h2,h3,h4,span,div').forEach(el=>{if(el.children.length===0&&(el.textContent||'').trim()==='利用規約')el.remove();});
  }
  window.initVisitorCounter=function(){
    const el=document.getElementById('count');if(!el)return;el.classList.add('visitor-count-live');
    const key='nakayosi_visitor_local_v2';let local=Number(localStorage.getItem(key)||'0');
    const show=v=>{if(Number.isFinite(v)&&v>0)el.textContent=Math.round(v).toLocaleString('ja-JP');};
    fetch('https://api.counterapi.dev/v1/nakayosi-instance-2/visits/up',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(d=>show(Number(d.count??d.value))).catch(()=>{local+=1;try{localStorage.setItem(key,String(local));}catch(_){}show(12348+local);});
  };
  function markRead(){try{const latest=(window.NEWS||[]).map(n=>n.date).sort().pop();if(latest)localStorage.setItem('nakayosi_notif_lastseen_v1',latest);}catch(_){}const dot=document.getElementById('notifDot');if(dot)dot.style.display='none';const btn=document.getElementById('notifBtn');if(btn)btn.classList.remove('has-new');}
  function wireNotif(){const btn=document.getElementById('notifBtn'),panel=document.getElementById('notifPanel');if(!btn||!panel||btn.dataset.readWired)return;btn.dataset.readWired='1';btn.onclick=function(e){e.stopPropagation();const opening=!panel.classList.contains('open');panel.classList.toggle('open',opening);if(opening){markRead();setTimeout(()=>{if(typeof renderNotif==='function')renderNotif();markRead();},0);}};}
  function init(){removeTerms();convert(document.body);wireNotif();new MutationObserver(m=>m.forEach(x=>x.addedNodes.forEach(n=>{if(n.nodeType===1)convert(n)}))).observe(document.body,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

;

(function(){
  const NKYS_THEME_KEY = 'nkys_search_theme';
  const SITE_SETTINGS_KEY = 'nakayosi_settings_v1';
  function readSiteTheme(){
    try { return JSON.parse(localStorage.getItem(SITE_SETTINGS_KEY) || '{}').dark ? 'dark' : 'light'; }
    catch (_) { return 'light'; }
  }
  function writeTheme(theme){
    const normalized = theme === 'dark' ? 'dark' : 'light';
    try {
      localStorage.setItem(NKYS_THEME_KEY, normalized);
      const settings = JSON.parse(localStorage.getItem(SITE_SETTINGS_KEY) || '{}');
      settings.dark = normalized === 'dark';
      localStorage.setItem(SITE_SETTINGS_KEY, JSON.stringify(settings));
    } catch (_) {}
    document.body.classList.toggle('dark-mode', normalized === 'dark');
    const app = document.getElementById('search-app');
    if(app) app.setAttribute('data-theme', normalized);
    const select = document.getElementById('settingTheme');
    if(select) select.value = normalized;
  }
  function applyUnifiedTheme(){
    let theme = null;
    try { theme = localStorage.getItem(NKYS_THEME_KEY); } catch (_) {}
    if(theme !== 'dark' && theme !== 'light') theme = readSiteTheme();
    writeTheme(theme);
  }
  function bindThemePersistence(){
    applyUnifiedTheme();
    const select = document.getElementById('settingTheme');
    if(select) select.addEventListener('change', function(){ writeTheme(this.value); });
    const originalToggle = window.toggleTheme;
    if(typeof originalToggle === 'function' && !originalToggle.__nkysWrapped){
      const wrappedToggle = function(){
        originalToggle.apply(this, arguments);
        writeTheme(document.body.classList.contains('dark-mode') ? 'dark' : 'light');
      };
      wrappedToggle.__nkysWrapped = true;
      window.toggleTheme = wrappedToggle;
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindThemePersistence, {once:true});
  else bindThemePersistence();
  window.addEventListener('storage', function(event){
    if(event.key === NKYS_THEME_KEY || event.key === SITE_SETTINGS_KEY) applyUnifiedTheme();
  });
})();

;

(function(){
  const ORDER=['glass','dark','light'];
  const KEY='nakayosi_theme_v2';
  function current(){return document.body.classList.contains('glass-mode')?'glass':document.body.classList.contains('dark-mode')?'dark':'light'}
  function apply(theme,save){
    if(!ORDER.includes(theme))theme='glass';
    document.body.classList.toggle('glass-mode',theme==='glass');
    document.body.classList.toggle('dark-mode',theme==='dark');
    document.body.dataset.theme=theme;
    const app=document.getElementById('search-app');if(app)app.setAttribute('data-theme',theme);
    const btn=document.querySelector('.theme-toggle-btn');if(btn){const next=ORDER[(ORDER.indexOf(theme)+1)%ORDER.length];btn.title=`表示: ${theme==='glass'?'グラス':theme==='dark'?'ダーク':'ライト'}（次: ${next==='glass'?'グラス':next==='dark'?'ダーク':'ライト'}）`;btn.setAttribute('aria-label',btn.title)}
    document.querySelectorAll('#smTheme button[data-theme]').forEach(b=>b.classList.toggle('active',b.dataset.theme===theme));
    if(save){try{localStorage.setItem(KEY,theme);const settings=JSON.parse(localStorage.getItem('nakayosi_settings_v1')||'{}');settings.theme=theme;settings.dark=theme==='dark';localStorage.setItem('nakayosi_settings_v1',JSON.stringify(settings));localStorage.setItem('nkys_search_theme',theme==='dark'?'dark':'light')}catch(_){}}
  }
  function boot(){
    let saved='glass';try{saved=localStorage.getItem(KEY)||'glass'}catch(_){}
    apply(saved,false);
    window.toggleTheme=function(){const now=current();apply(ORDER[(ORDER.indexOf(now)+1)%ORDER.length],true)};
    const menu=document.querySelector('.menu-toggle'),nav=document.getElementById('gnav'),links=document.getElementById('gnavLinks');
    if(menu&&nav){const close=()=>{nav.classList.remove('open');menu.setAttribute('aria-expanded','false');menu.firstChild.textContent='☰ メニュー';document.body.style.overflow=''};menu.setAttribute('type','button');menu.setAttribute('aria-controls','gnavLinks');menu.setAttribute('aria-haspopup','true');menu.setAttribute('aria-expanded','false');menu.onclick=function(e){e.stopPropagation();const open=!nav.classList.contains('open');open?nav.classList.add('open'):nav.classList.remove('open');menu.setAttribute('aria-expanded',String(open));menu.firstChild.textContent=open?'✕ メニューを閉じる':'☰ メニュー';document.body.style.overflow=''};
      if(links)links.addEventListener('click',e=>{if(e.target.closest('a'))close()});
      document.addEventListener('click',e=>{if(nav.classList.contains('open')&&!nav.contains(e.target))close()});
      document.addEventListener('keydown',e=>{if(e.key==='Escape'&&nav.classList.contains('open')){close();menu.focus()}});
      window.addEventListener('resize',()=>{if(innerWidth>1024)close()},{passive:true});
    }
    const sm=document.getElementById('smTheme');if(sm&&!sm.querySelector('[data-theme="glass"]')){const b=document.createElement('button');b.type='button';b.dataset.theme='glass';b.textContent='グラス';sm.prepend(b)}
    if(sm)sm.addEventListener('click',e=>{const b=e.target.closest('button[data-theme]');if(b){e.stopImmediatePropagation();apply(b.dataset.theme,true)}},true);
    const header=document.querySelector('#search-app .search-header');
    if(header&&!header.querySelector('.nkys-quick-actions')){const actions=document.createElement('div');actions.className='nkys-quick-actions';actions.setAttribute('aria-label','クイックアクセス');actions.innerHTML='<button type="button" class="nkys-quick-action" data-action="web" title="Web検索"><svg viewBox="0 0 24 24"><use href="#icon-web"></use></svg><span>Web検索</span></button><button type="button" class="nkys-quick-action" data-action="news" title="ニュース検索"><svg viewBox="0 0 24 24"><use href="#icon-news"></use></svg><span>ニュース検索</span></button><button type="button" class="nkys-quick-action" data-action="images" title="画像検索"><svg viewBox="0 0 24 24"><use href="#icon-image"></use></svg><span>画像検索</span></button><button type="button" class="nkys-quick-action" data-action="videos" title="動画検索"><svg viewBox="0 0 24 24"><use href="#icon-video"></use></svg><span>動画検索</span></button><button type="button" class="nkys-quick-action" data-action="settings" title="検索設定"><svg viewBox="0 0 24 24"><use href="#icon-settings"></use></svg><span>検索設定</span></button>';actions.addEventListener('click',e=>{const b=e.target.closest('button[data-action]');if(!b)return;if(b.dataset.action==='settings'){if(typeof window.openSettings==='function')window.openSettings();return}const input=document.getElementById('sxSearchInput');if(input)input.focus();const tab=document.querySelector(`#search-app .tab[data-cat="${b.dataset.action}"]`);if(tab&&document.getElementById('mainContainer')?.classList.contains('results-mode'))tab.click()});header.appendChild(actions)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

;

(function(){
  // クイックメモ（自動保存）
  var MEMO_KEY='nakayosi_quick_memo_v1';
  var memo=document.getElementById('quickMemo'),memoStatus=document.getElementById('quickMemoStatus');
  if(memo){
    try{memo.value=localStorage.getItem(MEMO_KEY)||'';}catch(_){}
    var t=null;
    memo.addEventListener('input',function(){
      clearTimeout(t);
      t=setTimeout(function(){
        try{localStorage.setItem(MEMO_KEY,memo.value);if(memoStatus)memoStatus.textContent='保存しました '+new Date().toLocaleTimeString('ja-JP');}catch(_){ }
      },300);
    });
  }
  window.clearQuickMemo=function(){
    if(!memo)return;
    memo.value='';
    try{localStorage.removeItem(MEMO_KEY);}catch(_){}
    if(memoStatus)memoStatus.textContent='消去しました';
  };
  // おみくじ
  var OMIKUJI=[['大吉','最高の一日！何をやってもうまくいく予感。'],['中吉','良い流れ。新しいことに挑戦してみて。'],['小吉','小さな幸せが見つかる日。'],['吉','安定した運気。いつも通りでOK。'],['末吉','焦らずじっくりいけば好結果。'],['凶','慎重にいこう。休憩も大事。']];
  var OM_KEY='nakayosi_omikuji_v1';
  function todayKey(){var d=new Date();return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();}
  function showOmikuji(i,drawnToday){
    var el=document.getElementById('omikujiResult'),btn=document.getElementById('omikujiBtn'),note=document.getElementById('omikujiNote');
    if(el){var r=OMIKUJI[i];el.innerHTML='<span class="om-k">'+r[0]+'</span><span>'+r[1]+'</span>';}
    if(drawnToday){if(btn){btn.disabled=true;btn.textContent='また明日';}if(note)note.textContent='今日はもう引きました';}
  }
  function readOm(){try{return JSON.parse(localStorage.getItem(OM_KEY)||'null');}catch(_){return null;}}
  window.drawOmikuji=function(){
    var saved=readOm();
    if(saved&&saved.day===todayKey()){showOmikuji(saved.i,true);return;}
    var i=Math.floor(Math.random()*OMIKUJI.length);
    try{localStorage.setItem(OM_KEY,JSON.stringify({day:todayKey(),i:i}));}catch(_){}
    showOmikuji(i,true);
  };
  (function(){var saved=readOm();if(saved&&saved.day===todayKey())showOmikuji(saved.i,true);})();

  // カウントダウンタイマー
  var tmLeft=300,tmTimer=null,tmEnd=0;
  function tmFmt(sec){sec=Math.max(0,Math.round(sec));var m=Math.floor(sec/60),s=sec%60;return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');}
  function tmDraw(){var el=document.getElementById('tmDisplay');if(el)el.textContent=tmFmt(tmTimer?(tmEnd-Date.now())/1000:tmLeft);}
  function tmStop(label){if(tmTimer){clearInterval(tmTimer);tmTimer=null;}var b=document.getElementById('tmToggle');if(b)b.textContent=label||'スタート';}
  window.tmAdd=function(sec){if(tmTimer){tmEnd+=sec*1000;}else{tmLeft=Math.max(0,tmLeft+sec);}tmDraw();};
  window.tmReset=function(){tmStop();tmLeft=300;tmDraw();var n=document.getElementById('tmNote');if(n)n.textContent='時間になるとお知らせします';};
  window.tmToggleRun=function(){
    if(tmTimer){tmLeft=Math.max(0,(tmEnd-Date.now())/1000);tmStop();tmDraw();return;}
    if(tmLeft<=0)tmLeft=300;
    tmEnd=Date.now()+tmLeft*1000;
    var b=document.getElementById('tmToggle');if(b)b.textContent='一時停止';
    tmTimer=setInterval(function(){
      if(Date.now()>=tmEnd){tmLeft=0;tmStop();tmDraw();var n=document.getElementById('tmNote');if(n)n.textContent='⏰ 時間になりました！';try{alert('⏰ タイマー終了！');}catch(_){}return;}
      tmDraw();
    },200);
    tmDraw();
  };
  tmDraw();

  // 割り勘
  window.calcWarikan=function(){
    var a=parseFloat((document.getElementById('wariAmount')||{}).value),p=parseInt((document.getElementById('wariPeople')||{}).value,10),el=document.getElementById('wariResult');
    if(!el)return;
    if(!(a>0)||!(p>0)){el.textContent='金額と人数を入れてね';return;}
    var each=a/p,round=Math.ceil(each/100)*100;
    el.textContent='1人あたり '+Math.round(each).toLocaleString('ja-JP')+'円（切り上げ '+round.toLocaleString('ja-JP')+'円）';
  };

  // ルーレット
  window.spinRoulette=function(){
    var inp=document.getElementById('rouletteItems'),el=document.getElementById('rouletteResult');if(!el)return;
    var items=((inp&&inp.value)||'').split(/[,、\n]/).map(function(x){return x.trim();}).filter(Boolean);
    if(!items.length){el.textContent='候補を2つ以上入れてね';return;}
    var n=0,iv=setInterval(function(){
      el.textContent=items[Math.floor(Math.random()*items.length)];
      if(++n>12){clearInterval(iv);el.textContent='👉 '+items[Math.floor(Math.random()*items.length)];}
    },70);
  };

  // パスワード生成
  window.genPassword=function(){
    var len=Math.min(40,Math.max(6,parseInt((document.getElementById('pwLen')||{}).value,10)||14));
    var sym=(document.getElementById('pwSym')||{}).checked;
    var chars='abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'+(sym?'!@#$%&*?-_=+':'');
    var out='',arr=null;
    try{arr=new Uint32Array(len);crypto.getRandomValues(arr);}catch(_){}
    for(var i=0;i<len;i++){var r=arr?arr[i]:Math.floor(Math.random()*4294967296);out+=chars[r%chars.length];}
    var el=document.getElementById('pwResult');if(el)el.textContent=out;
  };
  window.copyPassword=function(){
    var el=document.getElementById('pwResult');if(!el)return;
    try{navigator.clipboard.writeText(el.textContent);el.textContent=el.textContent;}catch(_){}
  };

  // 記念日カウント
  var DAY_KEY='nakayosi_dayto_v1';
  window.calcDays=function(){
    var inp=document.getElementById('dayTarget'),el=document.getElementById('dayResult');if(!inp||!el)return;
    if(!inp.value){el.textContent='日付を選んでね';return;}
    try{localStorage.setItem(DAY_KEY,inp.value);}catch(_){}
    var t=new Date(inp.value+'T00:00:00'),n=new Date();n.setHours(0,0,0,0);
    var diff=Math.round((t-n)/86400000);
    el.textContent=diff>0?('あと '+diff+' 日'):(diff===0?'今日です！🎉':(Math.abs(diff)+' 日前でした'));
  };
  (function(){var inp=document.getElementById('dayTarget');if(!inp)return;try{var v=localStorage.getItem(DAY_KEY);if(v){inp.value=v;window.calcDays();}}catch(_){}})();
  // ストップウォッチ
  var swStart=0,swAcc=0,swTimer=null;
  function fmt(ms){var m=Math.floor(ms/60000),s=Math.floor(ms%60000/1000),d=Math.floor(ms%1000/100);return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')+'.'+d;}
  function draw(){var el=document.getElementById('swDisplay');if(el)el.textContent=fmt(swAcc+(swTimer?Date.now()-swStart:0));}
  window.swToggleRun=function(){
    var btn=document.getElementById('swToggle');
    if(swTimer){clearInterval(swTimer);swTimer=null;swAcc+=Date.now()-swStart;if(btn)btn.textContent='スタート';}
    else{swStart=Date.now();swTimer=setInterval(draw,100);if(btn)btn.textContent='ストップ';}
    draw();
  };
  window.swReset=function(){
    if(swTimer){clearInterval(swTimer);swTimer=null;}
    swAcc=0;var btn=document.getElementById('swToggle');if(btn)btn.textContent='スタート';draw();
  };
  // サイト情報ウィジェット：今日の日付
  (function(){
    var el=document.getElementById('siteToday');if(!el)return;
    var d=new Date(),w=['日','月','火','水','木','金','土'][d.getDay()];
    el.textContent='📅 '+d.getFullYear()+'年'+(d.getMonth()+1)+'月'+d.getDate()+'日（'+w+'）';
  })();
  // サイト情報ウィジェット：おみくじ（1日1回）
  var SITE_OMIKUJI=[
    {r:'大吉',c:'daikichi',m:'最高の運気！やりたいことがあるなら今日がその日。'},
    {r:'中吉',c:'',m:'良い流れが来ています。新しいことを始めるのにピッタリ。'},
    {r:'吉',c:'',m:'穏やかな一日。いつも通りできっと良い結果に。'},
    {r:'小吉',c:'',m:'小さな幸せが潜んでいます。周りをよく見てみて。'},
    {r:'末吉',c:'',m:'今は我慢の時。じっくり準備すれば運は上向きます。'},
    {r:'凶',c:'kyo',m:'急がば回れ。落ち着いて一歩ずつ進めば大丈夫。'},
    {r:'大凶',c:'kyo',m:'今日は無理せず休もう。明日への大きなチャージに。'}
  ];
  var SITE_OMK_KEY='nakayosi_site_omikuji_v1';
  function siteTodayStr(){var d=new Date();return d.getFullYear()+'/'+(d.getMonth()+1)+'/'+d.getDate();}
  function loadSiteOmikujiState(){
    var box=document.getElementById('siteOmikujiResult'),btn=document.getElementById('siteOmikujiBtn');
    if(!box||!btn)return;
    var saved=null;try{saved=JSON.parse(localStorage.getItem(SITE_OMK_KEY)||'null');}catch(e){}
    if(saved&&saved.date===siteTodayStr()&&SITE_OMIKUJI[saved.idx]){
      var f=SITE_OMIKUJI[saved.idx];
      box.innerHTML='<span class="site-omikuji-rank '+f.c+'">'+f.r+'</span><span class="site-omikuji-msg">'+f.m+'</span>';
      box.className='site-omikuji-result show';
      btn.disabled=true;btn.textContent='本日は引き終わりました 🌙';
    }
  }
  window.drawSiteOmikuji=function(){
    var box=document.getElementById('siteOmikujiResult'),btn=document.getElementById('siteOmikujiBtn');
    if(!box||!btn||btn.disabled)return;
    var saved=null;try{saved=JSON.parse(localStorage.getItem(SITE_OMK_KEY)||'null');}catch(e){}
    if(saved&&saved.date===siteTodayStr()){loadSiteOmikujiState();return;}
    var i=Math.floor(Math.random()*SITE_OMIKUJI.length),f=SITE_OMIKUJI[i];
    try{localStorage.setItem(SITE_OMK_KEY,JSON.stringify({date:siteTodayStr(),idx:i}));}catch(e){}
    box.className='site-omikuji-result';
    box.innerHTML='<span class="site-omikuji-rank '+f.c+'">'+f.r+'</span><span class="site-omikuji-msg">'+f.m+'</span>';
    requestAnimationFrame(function(){requestAnimationFrame(function(){box.className='site-omikuji-result show';});});
    btn.disabled=true;btn.textContent='本日は引き終わりました 🌙';
  };
  loadSiteOmikujiState();
})();

;

(function(){
  var gate=document.getElementById('googleCookieGate');
  var accept=document.getElementById('googleCookieAccept');
  if(!gate||!accept)return;
  accept.addEventListener('click',function(){
    gate.style.transition='opacity .22s ease';
    gate.style.opacity='0';
    gate.style.pointerEvents='none';
    window.setTimeout(function(){gate.remove();},240);
  });
})();
