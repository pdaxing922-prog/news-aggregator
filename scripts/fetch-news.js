import Parser from 'rss-parser';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, '..', 'public', 'news.json');
const SCRIPT_START = Date.now();
const GLOBAL_TIMEOUT = 120_000; // 2 minutes max for entire script

const rssParser = new Parser({
  customFields: { item: ['media:content', 'description'] },
  timeout: 15000,
  headers: {
    'User-Agent': 'NewsAggregator/1.0',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
  },
});

// ============================================================
// Fetch X hot posts — fast, reliable sources
// ============================================================
async function fetchXPosts() {
  const all = [];
  // Source 1: Reddit r/Twitter (fast JSON API, works from GH Actions)
  try {
    const res = await fetch('https://www.reddit.com/r/Twitter/hot.json?limit=25', {
      headers: { 'User-Agent': 'NewsAggregator/1.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const json = await res.json();
      for (const c of json.data.children) {
        const d = c.data;
        if (d.stickied) continue;
        all.push({
          title: d.title,
          url: d.url || `https://www.reddit.com${d.permalink}`,
          source: '𝕏 热议推文',
          sourceIcon: '𝕏',
          lang: 'en',
          category: 'X热帖',
          publishTime: new Date(d.created_utc * 1000).toISOString(),
          summary: (d.selftext || '').slice(0, 250),
          hotness: (d.ups || 0) + (d.num_comments || 0) * 2,
        });
      }
      console.log(`  ✓ X 热帖 (Reddit): ${all.length} 条`);
    }
  } catch (e) {
    console.warn(`  ✗ X (Reddit): ${e.message.slice(0, 40)}`);
  }

  // Source 2: Nitter.net RSS (Twitter mirror — fast HTTP)
  if (all.length < 20) {
    try {
      const feed = await rssParser.parseURL('https://nitter.net/rss');
      for (const item of (feed.items || []).slice(0, 20)) {
        all.push({
          title: (item.title || '').trim().replace(/^RT by .+: /, ''),
          url: item.link || `https://x.com${item.guid || ''}`,
          source: '𝕏 趋势',
          sourceIcon: '𝕏',
          lang: 'en',
          category: 'X热帖',
          publishTime: new Date().toISOString(),
          summary: (item.contentSnippet || '').slice(0, 250),
          hotness: 12,
        });
      }
      console.log(`  ✓ X 热帖 (Nitter): ${Math.min(feed.items?.length || 0, 20)} 条`);
    } catch (e) {
      console.warn(`  ✗ X (Nitter): ${e.message.slice(0, 40)}`);
    }
  }

  return all;
}

// ============================================================
// RSS sources — 国际 / 政治 / 金融 / 经济 / 科技 / Web3 / 区块链 / 潮流 / X热帖
// ============================================================
const RSS_SOURCES = [
  // ---- 国际 ----
  { name: 'BBC World',        icon: '🇬🇧', url: 'https://feeds.bbci.co.uk/news/world/rss.xml',              lang: 'en', category: '国际' },
  { name: 'NPR World',        icon: '🇺🇸', url: 'https://feeds.npr.org/1004/rss.xml',                        lang: 'en', category: '国际' },
  { name: 'The Guardian',     icon: '🇬🇧', url: 'https://www.theguardian.com/world/rss',                     lang: 'en', category: '国际' },
  { name: 'DW News',          icon: '🇩🇪', url: 'https://rss.dw.com/rdf/rss-en-all',                         lang: 'en', category: '国际' },
  { name: 'CNA Asia',         icon: '🇸🇬', url: 'https://www.channelnewsasia.com/rss/latest',                lang: 'en', category: '国际' },
  // ---- 政治 ----
  { name: 'BBC Politics',     icon: '🏛️', url: 'https://feeds.bbci.co.uk/news/politics/rss.xml',            lang: 'en', category: '政治' },
  { name: 'The Hill',         icon: '🏛️', url: 'https://thehill.com/rss/syndicator/19110',                  lang: 'en', category: '政治' },
  // ---- 金融 ----
  { name: 'CNBC Top News',    icon: '💰', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114', lang: 'en', category: '金融' },
  { name: 'MarketWatch',      icon: '📈', url: 'https://feeds.marketwatch.com/marketwatch/topstories',       lang: 'en', category: '金融' },
  { name: 'Yahoo Finance',    icon: '💵', url: 'https://finance.yahoo.com/news/rssindex',                    lang: 'en', category: '金融' },
  // ---- 科技 ----
  { name: 'TechCrunch',       icon: '💻', url: 'https://techcrunch.com/feed/',                              lang: 'en', category: '科技' },
  { name: 'The Verge',        icon: '📱', url: 'https://www.theverge.com/rss/index.xml',                     lang: 'en', category: '科技' },
  // ---- Web3 / 区块链 ----
  { name: 'CoinDesk',         icon: '₿',  url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',            lang: 'en', category: 'Web3' },
  { name: 'CoinTelegraph',    icon: '🪙', url: 'https://cointelegraph.com/rss',                              lang: 'en', category: '区块链' },
  // ---- 潮流 ----
  { name: 'Hypebeast',        icon: '🔥', url: 'https://hypebeast.com/feed',                                lang: 'en', category: '潮流' },
  // ---- 中文 ----
  { name: 'BBC 中文',         icon: '🇬🇧', url: 'https://feeds.bbci.co.uk/zhongwen/simp/rss.xml',            lang: 'zh', category: '国际' },
  { name: 'Google News 中文', icon: '🇨🇳', url: 'https://news.google.com/rss?hl=zh-CN&gl=CN&ceid=CN:zh-Hans', lang: 'zh', category: '中国' },
];

// ============================================================
// Reddit JSON API — 按板块对应分类
// ============================================================
const REDDIT_SOURCES = [
  { sub: 'worldnews',      icon: '🌍', category: '国际' },
  { sub: 'politics',       icon: '🏛️', category: '政治' },
  { sub: 'finance',        icon: '💰', category: '金融' },
  { sub: 'economy',        icon: '📊', category: '经济' },
  { sub: 'economics',      icon: '📊', category: '经济' },
  { sub: 'technology',     icon: '📱', category: '科技' },
  { sub: 'web3',           icon: '🌐', category: 'Web3' },
  { sub: 'CryptoCurrency', icon: '🪙', category: '区块链' },
  { sub: 'blockchain',     icon: '🔗', category: '区块链' },
  { sub: 'popular',        icon: '🔥', category: '潮流' },
  { sub: 'China',          icon: '🇨🇳', category: '中国' },
];

async function fetchReddit(subreddit, icon, category) {
  const res = await fetch(`https://www.reddit.com/r/${subreddit}/hot.json?limit=20`, {
    headers: { 'User-Agent': 'NewsAggregator/1.0' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`${subreddit} HTTP ${res.status}`);
  const json = await res.json();
  return json.data.children
    .filter((c) => c.data && !c.data.stickied)
    .map((c) => ({
      title: c.data.title,
      url: `https://www.reddit.com${c.data.permalink}`,
      source: `Reddit r/${subreddit}`,
      sourceIcon: icon,
      lang: 'en',
      category,
      publishTime: new Date(c.data.created_utc * 1000).toISOString(),
      summary: (c.data.selftext || '').slice(0, 300),
      hotness: (c.data.ups || 0) + (c.data.num_comments || 0) * 2,
    }));
}

// ============================================================
// Hacker News
// ============================================================
async function fetchHackerNews() {
  const topRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', {
    signal: AbortSignal.timeout(10000),
  });
  if (!topRes.ok) throw new Error(`HN HTTP ${topRes.status}`);
  const ids = await topRes.json();

  const items = await Promise.allSettled(
    ids.slice(0, 30).map((id) =>
      fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
        signal: AbortSignal.timeout(10000),
      }).then((r) => r.json())
    )
  );

  return items
    .filter((r) => r.status === 'fulfilled' && r.value?.url)
    .map((r) => ({
      title: r.value.title,
      url: r.value.url,
      source: 'Hacker News',
      sourceIcon: '💻',
      lang: 'en',
      category: '科技',
      publishTime: new Date(r.value.time * 1000).toISOString(),
      summary: '',
      hotness: (r.value.score || 0) + (r.value.descendants || 0) * 2,
    }));
}

// ============================================================
// Dedup
// ============================================================
function getKeywords(title) {
  return (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function titleSimilar(a, b) {
  const ka = new Set(getKeywords(a));
  const kb = new Set(getKeywords(b));
  if (ka.size === 0 || kb.size === 0) return 0;
  let overlap = 0;
  for (const w of ka) if (kb.has(w)) overlap++;
  return overlap / Math.min(ka.size, kb.size);
}

function deduplicate(articles) {
  const seen = [];
  for (const a of articles) {
    if (!a.url || !a.title) continue;
    if (seen.some((s) => s.url === a.url)) continue;
    if (seen.some((s) => titleSimilar(s.title, a.title) > 0.7)) continue;
    seen.push(a);
  }
  return seen;
}

// ============================================================
// Main
// ============================================================
const CATEGORY_ORDER = ['全部', '国际', '政治', '金融', '经济', '科技', 'Web3', '区块链', '潮流', 'X热帖', '中国'];

async function fetchAll() {
  console.log(`\n[${new Date().toISOString()}] 开始抓取新闻...\n`);

  // ---- RSS ----
  const rssResults = await Promise.allSettled(
    RSS_SOURCES.map(async (src) => {
      try {
        const feed = await rssParser.parseURL(src.url);
        const items = feed.items.slice(0, 20).map((item) => ({
          title: (item.title || '').trim(),
          url: item.link || '',
          source: src.name,
          sourceIcon: src.icon,
          lang: src.lang,
          category: src.category,
          publishTime: item.isoDate || item.pubDate
            ? new Date(item.isoDate || item.pubDate).toISOString()
            : new Date().toISOString(),
          summary: (item.contentSnippet || item.description || '').replace(/<[^>]*>/g, '').slice(0, 300),
          hotness: 10,
        }));
        console.log(`  ✓ ${src.name}: ${items.length} 条`);
        return items;
      } catch (e) {
        console.warn(`  ✗ ${src.name}: ${e.message.slice(0, 60)}`);
        return [];
      }
    })
  );

  // --- Reddit ---
  const redditResults = await Promise.allSettled(
    REDDIT_SOURCES.map((r) =>
      fetchReddit(r.sub, r.icon, r.category).catch((e) => {
        console.warn(`  ✗ Reddit r/${r.sub}: ${e.message.slice(0, 40)}`);
        return [];
      })
    )
  );

  // --- Hacker News ---
  const hnResult = await fetchHackerNews().catch((e) => {
    console.warn(`  ✗ Hacker News: ${e.message}`);
    return [];
  });

  // --- X Posts (dedicated, links point to x.com) ---
  const xResult = await fetchXPosts().catch((e) => {
    console.warn(`  ✗ X 热帖: ${e.message.slice(0, 60)}`);
    return [];
  });
  if (xResult.length > 0) {
    console.log(`  ✓ X 推文: ${xResult.length} 条`);
  } else {
    console.warn('  ✗ X 平台: 所有实例均无法访问（国内受限，部署后正常）');
  }

  // --- Collect ---
  const all = [];
  for (const r of rssResults) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }
  for (const r of redditResults) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }
  all.push(...hnResult);
  all.push(...xResult);

  // --- Process ---
  console.log(`\n  原始: ${all.length} 条`);
  const unique = deduplicate(all);
  // 主排序: hotness 从高到低, 时间作为次排序
  unique.sort((a, b) => b.hotness - a.hotness || new Date(b.publishTime) - new Date(a.publishTime));

  const top = unique.slice(0, 200);
  console.log(`  去重排序后: ${top.length} 条 (按热度降序)`);

  // --- Next refresh (Beijing time: 6,10,14,18,22,2) ---
  const now = new Date();
  const bjHour = ((now.getUTCHours() + 8) % 24);
  const slots = [6, 10, 14, 18, 22, 2];
  let next = slots.find((h) => h > bjHour);
  if (next == null) next = slots[0];
  const nextRefresh = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), next - 8));
  if (nextRefresh <= now) nextRefresh.setUTCDate(nextRefresh.getUTCDate() + 1);

  // --- Build ordered category list (always include all, even empty ones) ---
  const orderedCategories = CATEGORY_ORDER.filter((c) => true); // show all

  // --- Stats ---
  const byCat = {};
  for (const a of top) {
    byCat[a.category] = (byCat[a.category] || 0) + 1;
  }

  // --- Output ---
  const output = {
    updatedAt: now.toISOString(),
    updatedAtBJ: new Date(now.getTime() + 8 * 3600000).toISOString().replace('T', ' ').slice(0, 19),
    nextRefreshAt: nextRefresh.toISOString(),
    nextRefreshBJ: new Date(nextRefresh.getTime() + 8 * 3600000).toISOString().replace('T', ' ').slice(0, 19),
    totalCount: top.length,
    categoryCount: orderedCategories.length - 1, // exclude "全部"
    categories: orderedCategories,
    categoryStats: byCat,
    articles: top,
  };

  writeFileSync(DATA_FILE, JSON.stringify(output, null, 2), 'utf-8');

  console.log('  分类分布:', byCat);
  console.log(`\n[${new Date().toISOString()}] 完成 ✓  下次刷新: ${output.nextRefreshBJ} (北京时间)\n`);
}

// ============================================================
// Entry point with global timeout
// ============================================================
Promise.race([
  fetchAll(),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Global timeout — script exceeded 2 minutes')), GLOBAL_TIMEOUT)
  ),
]).catch((err) => {
  console.error('抓取失败:', err.message);
  process.exit(1);
});
