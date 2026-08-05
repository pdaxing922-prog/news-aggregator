// ============================================================
// 全球热点 · 前端引擎 v3
// ============================================================

// ---- State ----
let newsData = null;
let activeCategory = '全部';
let translateMode = localStorage.getItem('translateMode') === 'true';

const trCache = new Map(
  JSON.parse(localStorage.getItem('trCache') || '[]')
);

// ---- DOM refs ----
const $ = (s) => document.querySelector(s);
const $grid = $('#newsGrid');
const $tabs = $('#categoryTabs');
const $themeToggle = $('#themeToggle');
const $translateToggle = $('#translateToggle');
const $xScroll = $('#xScroll');
const $xCount = $('#xCount');

// ============================================================
// Keyword → category mapping (client-side auto-tagger)
// Each article scans its title+summary against these to fill
// categories whose dedicated sources are unreachable locally.
// ============================================================
const KEYWORD_RULES = [
  { cat: '经济', kw: ['economy','economic','inflation','gdp','trade war','tariff','recession','fed reserve',
    'interest rate','stock market','dow','nasdaq','s&p','unemployment','debt','fiscal','monetary','央行',
    '经济','贸易','通胀','关税','衰退','美联储','利率','股市','就业','财政','货币','gdp','cpi'] },
  { cat: 'Web3', kw: ['web3','defi','nft','crypto','blockchain','bitcoin','ethereum','eth','btc','solana',
    'token','dao','smart contract','dapp','metaverse','decentralized','mining','staking','airdro','satoshi',
    '加密','区块','代币','挖矿','以太坊','比特币','去中心'] },
  { cat: '区块链', kw: ['blockchain','bitcoin','ethereum','crypto','btc','eth','solana','defi','nft',
    'token','mining','ledger','consensus','hash','区块','加密','代币','挖矿','以太坊','比特币'] },
  { cat: '中国', kw: ['china','chinese','beijing','shanghai','shenzhen','xi jinping','ccp','pla','taiwan',
    'hong kong','macau','中国','北京','上海','深圳','习近平','台湾','香港','澳门','解放军','国务院'] },
  { cat: '政治', kw: ['election','president','congress','senate','vote','policy','government','biden',
    'trump','democrat','republican','parliament','minister','diplomat','treaty','united nations','nato',
    'sanction','政治','选举','总统','国会','议院','投票','政策','政府','外交','制裁','联合国'] },
  { cat: '金融', kw: ['stock','wall street','investment','banking','rate hike','dollar','yen','euro',
    'forex','ipo','merger','acquisition','venture capital','hedge fund','s&p 500','dow jones',
    '金融','股市','投资','银行','基金','上市','并购','风投','对冲','证券'] },
  { cat: '潮流', kw: ['fashion','trend','viral','culture','celebrity','music','movie','netflix','style',
    'hype','sneaker','streetwear','流行','时尚','明星','音乐','电影','潮流','潮牌','穿搭'] },
];
// NOTE: X热帖 is NOT in keyword rules — it only contains real x.com tweets from the fetch script.

function autoTag(article) {
  const text = ((article.title || '') + ' ' + (article.summary || '')).toLowerCase();
  const tags = [article.category]; // original category (preserves source truth)
  for (const rule of KEYWORD_RULES) {
    if (tags.includes(rule.cat)) continue;
    if (rule.kw.some((k) => text.includes(k.toLowerCase()))) {
      tags.push(rule.cat);
    }
  }
  // X热帖 is source-verified: only articles originally fetched from X go there.
  // Never auto-tag non-X content into X热帖.
  article.tags = [...new Set(tags)];
}

// ============================================================
// Theme
// ============================================================
(function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    $themeToggle.textContent = '☀️';
  }
})();

$themeToggle.addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? '' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  $themeToggle.textContent = next === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('theme', next || 'light');
});

// ============================================================
// Translation engine
// ============================================================
function saveTrCache() {
  const entries = [...trCache.entries()].slice(-500);
  localStorage.setItem('trCache', JSON.stringify(entries));
}

async function translateOne(text) {
  if (!text || text.length < 3) return text;
  const cached = trCache.get(text);
  if (cached) return cached;
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|zh-CN`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.responseStatus === 403) throw new Error('quota');
    const tr = data.responseData?.translatedText || text;
    trCache.set(text, tr);
    saveTrCache();
    return tr;
  } catch {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const data = await res.json();
      const tr = (data[0] || []).map((x) => x[0] || '').join('') || text;
      trCache.set(text, tr);
      saveTrCache();
      return tr;
    } catch {
      return text;
    }
  }
}

async function translateBatch(texts) {
  const toTranslate = texts.filter((t) => t && t.length >= 3 && !trCache.has(t));
  if (toTranslate.length === 0) return;
  for (let i = 0; i < toTranslate.length; i += 8) {
    await Promise.allSettled(toTranslate.slice(i, i + 8).map((t) => translateOne(t)));
  }
  saveTrCache();
}

// ============================================================
// Translate toggle
// ============================================================
function updateTranslateUI() {
  if (translateMode) {
    $translateToggle.textContent = '🌐 翻译开';
    $translateToggle.classList.add('active-feature');
  } else {
    $translateToggle.textContent = '🌐 翻译关';
    $translateToggle.classList.remove('active-feature');
  }
}
updateTranslateUI();

$translateToggle.addEventListener('click', async () => {
  translateMode = !translateMode;
  localStorage.setItem('translateMode', translateMode);
  updateTranslateUI();
  if (translateMode) {
    const enTitles = filterArticles().filter((a) => a.lang !== 'zh').map((a) => a.title);
    const xTitles = getXArticles().filter((a) => a.lang !== 'zh').map((a) => a.title);
    await translateBatch([...enTitles, ...xTitles]);
  }
  renderXSection();
  renderCards();
});

// ============================================================
// Countdown
// ============================================================
function updateCountdown() {
  if (!newsData?.nextRefreshAt) return;
  const diff = new Date(newsData.nextRefreshAt).getTime() - Date.now();
  const el = $('#statNext');
  if (diff <= 0) { el.textContent = '刷新中…'; return; }
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  el.textContent = h > 0 ? `${h}h${m}m 后` : `${m}m 后`;
}

// ============================================================
// Load data
// ============================================================
async function loadNews() {
  $grid.innerHTML = Array.from({ length: 9 }, () => `
    <div class="skeleton-card">
      <div class="skeleton skeleton-badge"></div>
      <div class="skeleton skeleton-title"></div>
      <div class="skeleton skeleton-title short"></div>
      <div class="skeleton skeleton-text"></div>
      <div class="skeleton skeleton-text short"></div>
    </div>
  `).join('');

  try {
    const res = await fetch('news.json?' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    newsData = await res.json();

    // Auto-tag every article with keyword rules
    for (const a of newsData.articles) autoTag(a);

    // Rebuild category list from actual tags + preset order
    rebuildCategories();

    renderAll();

    if (translateMode) {
      const enTitles = newsData.articles.filter((a) => a.lang !== 'zh').map((a) => a.title);
      await translateBatch(enTitles);
      renderXSection();
      renderCards();
    }
  } catch (err) {
    $grid.innerHTML = `
      <div class="empty-state">
        <div class="icon">📡</div>
        <div class="msg">数据加载失败</div>
        <div style="font-size:0.8rem;margin-top:8px">${err.message} — 请稍后刷新页面</div>
      </div>`;
  }
}

// Rebuild categories from actual tags found in articles
const PRESET_ORDER = ['全部', '国际', '政治', '金融', '经济', '科技', 'Web3', '区块链', '潮流', 'X热帖', '中国'];
function rebuildCategories() {
  const tagSet = new Set();
  for (const a of newsData.articles) {
    for (const t of (a.tags || [])) tagSet.add(t);
  }
  // Merge preset order with actual tags, exclude X热帖 (has own section)
  const cats = ['全部'];
  for (const p of PRESET_ORDER) {
    if (p !== '全部' && p !== 'X热帖' && tagSet.has(p)) cats.push(p);
  }
  newsData.categories = cats;
  newsData.categoryCount = cats.length - 1;
}

// ============================================================
// Render all
// ============================================================
function renderAll() {
  $('#statTotal').textContent = newsData.totalCount || 0;
  $('#statCats').textContent = newsData.categoryCount || (newsData.categories?.length - 1) || 0;
  $('#statUpdate').textContent = newsData.updatedAtBJ ? `更新 ${newsData.updatedAtBJ.slice(5)}` : '';

  const counts = computeCategoryCounts();
  renderTabs(counts);
  renderXSection();
  renderCards();
  updateCountdown();
  setInterval(updateCountdown, 60000);
}

// ============================================================
// Filter — no language filter, all languages shown together
// ============================================================
function computeCategoryCounts() {
  if (!newsData?.articles) return {};
  const pool = newsData.articles.filter((a) => a.category !== 'X热帖');
  const counts = { '全部': pool.length };
  for (const a of pool) {
    for (const t of (a.tags || [a.category])) {
      counts[t] = (counts[t] || 0) + 1;
    }
  }
  return counts;
}

function filterArticles() {
  if (!newsData?.articles) return [];
  // Exclude X热帖 from main grid — it has its own dedicated section above
  let pool = newsData.articles.filter((a) => a.category !== 'X热帖');
  if (activeCategory === '全部') return pool;
  return pool.filter((a) =>
    (a.tags || [a.category]).includes(activeCategory) || a.category === activeCategory
  );
}

// ============================================================
// Render tabs
// ============================================================
function renderTabs(counts) {
  const cats = newsData?.categories || ['全部'];
  $tabs.innerHTML = cats
    .map((c) => {
      const n = counts[c] || 0;
      const active = c === activeCategory ? ' active' : '';
      return `<button class="tab${active}" data-cat="${c}">${c}<span class="count">${n}</span></button>`;
    })
    .join('');

  $tabs.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeCategory = btn.dataset.cat;
      const counts = computeCategoryCounts();
      renderTabs(counts);
      renderCards();
    });
  });
}

// ============================================================
// Hotness helpers
// ============================================================
function hotLevel(h) {
  if (h > 100) return 3;
  if (h > 40)  return 2;
  if (h > 15)  return 1;
  return 0;
}
function hotEmoji(level) {
  if (level === 3) return '🔥🔥🔥';
  if (level === 2) return '🔥🔥';
  if (level === 1) return '🔥';
  return '';
}
function rankBadge(idx) {
  if (idx === 0) return '<span class="rank-badge rank-1">1</span>';
  if (idx === 1) return '<span class="rank-badge rank-2">2</span>';
  if (idx === 2) return '<span class="rank-badge rank-3">3</span>';
  if (idx < 10) return `<span class="rank-badge rank-n">${idx + 1}</span>`;
  return '';
}

// ============================================================
// Render dedicated 𝕏 X热帖 section
// ============================================================
function getXArticles() {
  if (!newsData?.articles) return [];
  return newsData.articles.filter((a) => a.category === 'X热帖' && a.sourceIcon === '𝕏');
}

function renderXSection() {
  const xArticles = getXArticles();
  $xCount.textContent = `${xArticles.length} 条`;

  if (xArticles.length === 0) {
    $xScroll.innerHTML = `
      <div class="x-empty">
        <div style="font-size:1.5rem;margin-bottom:8px">𝕏</div>
        X 平台热帖暂未抓取成功<br>
        <span style="font-size:0.75rem;opacity:0.6">Nitter 镜像在 GitHub Actions 环境中偶有波动，下次刷新后自动恢复</span>
      </div>`;
    return;
  }

  $xScroll.innerHTML = xArticles.slice(0, 15).map((a, i) => renderXCard(a, i)).join('');
}

function renderXCard(a, idx) {
  const time = formatTime(a.publishTime);
  const level = hotLevel(a.hotness);
  const emoji = hotEmoji(level);
  const title = resolveTitle(a);

  return `
    <article class="x-card" data-idx="${idx}">
      <div class="x-card-top">
        <span class="x-card-badge">𝕏 热议</span>
        ${level >= 2 ? `<span class="x-card-hot">${emoji}</span>` : ''}
      </div>
      <h3 class="x-card-title">
        <a href="${escAttr(a.url)}" target="_blank" rel="noopener noreferrer">${esc(title)}</a>
      </h3>
      <div class="x-card-footer">
        <span>${a.source}</span>
        <span>${time}</span>
      </div>
    </article>`;
}

// ============================================================
// Render cards
// ============================================================
function renderCards() {
  const articles = filterArticles();

  if (articles.length === 0) {
    $grid.innerHTML = `
      <div class="empty-state">
        <div class="icon">📭</div>
        <div class="msg">该板块暂无新闻</div>
        <div style="font-size:0.8rem;margin-top:8px;max-width:360px;margin-left:auto;margin-right:auto">
          部署到 GitHub Pages 后将覆盖全部新闻源。<br>也可切换「全部」板块浏览当前已抓取的 ${newsData?.totalCount || 0} 条热点。
        </div>
      </div>`;
    return;
  }

  $grid.innerHTML = articles.map((a, idx) => renderCard(a, idx)).join('');
}

function resolveTitle(a) {
  if (translateMode && a.lang !== 'zh') {
    const cached = trCache.get(a.title);
    if (cached) return cached;
  }
  return a.title;
}

function renderCard(a, idx) {
  const time = formatTime(a.publishTime);
  const level = hotLevel(a.hotness);
  const emoji = hotEmoji(level);
  const rank = rankBadge(idx);
  const isEN = a.lang !== 'zh';
  const title = resolveTitle(a);
  const hasRank = idx < 10;

  return `
    <article class="card${hasRank ? ' has-rank' : ''}">
      ${rank}
      <div class="card-header">
        <span class="source-badge">${a.sourceIcon || ''} ${a.source}</span>
        ${level >= 2 ? `<span class="hot-level level-${level}">${emoji}</span>` : ''}
      </div>
      ${isEN ? `<button class="translate-btn" data-idx="${idx}" data-url="${escAttr(a.url)}" title="翻译此条">译</button>` : ''}
      <h3 class="card-title">
        <a href="${escAttr(a.url)}" target="_blank" rel="noopener noreferrer" data-idx="${idx}">${esc(title)}</a>
      </h3>
      ${a.summary ? `<p class="card-summary">${esc(a.summary)}</p>` : ''}
      <div class="card-footer">
        <span>${time}</span>
        <span>${level >= 1 ? emoji + ' ' : ''}${a.lang === 'zh' ? '中文' : 'EN'}</span>
      </div>
    </article>`;
}

// ============================================================
// Delegated events
// ============================================================
$grid.addEventListener('click', async (e) => {
  const trBtn = e.target.closest('.translate-btn');
  if (trBtn) {
    e.preventDefault();
    const idx = parseInt(trBtn.dataset.idx);
    const articles = filterArticles();
    const a = articles[idx];
    if (!a) return;
    if (!trBtn.classList.contains('translated')) {
      trBtn.textContent = '…';
      const result = await translateOne(a.title);
      trBtn.textContent = '✓';
      trBtn.classList.add('translated');
      const titleLink = $grid.querySelector(`a[data-idx="${idx}"]`);
      if (titleLink) titleLink.textContent = result;
    }
  }
});

// ============================================================
// Helpers
// ============================================================
function esc(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
function escAttr(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now - d) / 60000);
  const diffH = Math.floor((now - d) / 3600000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  if (diffH < 24) return `${diffH}小时前`;
  const bj = new Date(d.getTime() + 8 * 3600000);
  return `${String(bj.getUTCMonth() + 1).padStart(2, '0')}-${String(bj.getUTCDate()).padStart(2, '0')}`;
}

// ============================================================
// Boot
// ============================================================
loadNews();
