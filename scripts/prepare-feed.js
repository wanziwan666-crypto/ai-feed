/**
 * prepare-feed.js
 * Fetches all RSS sources and outputs data/feed.json.
 * NO API calls — pure RSS fetching. Run by GitHub Actions daily.
 *
 * Output: data/feed.json with raw items (no summaries — agent does that)
 */
const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'sources.json');
const OUTPUT_PATH = path.join(DATA_DIR, 'feed.json');
const MAX_AGE_HOURS = 24;
const MAX_ITEMS_PER_SOURCE = 20;

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
const { sources: RSS_SOURCES, keywords: KEYWORDS } = config;

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml',
  },
  customFields: { item: ['description', 'content:encoded'] },
});

function matchKeywords(title, contentSnippet, customKeywords) {
  const keywords = customKeywords || KEYWORDS;
  const text = `${title} ${contentSnippet || ''}`.toLowerCase();
  return keywords.some(kw => text.includes(kw.toLowerCase()));
}

async function fetchSource(source) {
  try {
    // 先抓原始 XML，清理常见格式问题（GitHub Trending 的 RSS 有未转义的 & 等）
    let xml;
    try {
      const resp = await fetch(source.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml',
        },
        signal: AbortSignal.timeout(15000),
      });
      xml = await resp.text();
      // 修复未转义的 &（不是合法 XML entity 的 &）
      xml = xml.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
    } catch (e) {
      // fetch 失败时 fallback 到 parser.parseURL
      const feed = await parser.parseURL(source.url);
      return extractItems(feed, source);
    }
    const feed = await parser.parseString(xml);
    return extractItems(feed, source);
  } catch (err) {
    console.error(`  Error: ${source.name}: ${err.message}`);
    return [];
  }
}

function extractItems(feed, source) {
  const maxItems = source.maxItems || MAX_ITEMS_PER_SOURCE;
  const items = (feed.items || [])
    .slice(0, maxItems)
    .filter(item => {
      if (item.pubDate) {
        const age = (Date.now() - new Date(item.pubDate).getTime()) / (1000 * 60 * 60);
        if (age > MAX_AGE_HOURS) return false;
      }
      if (source.skipKeywordFilter) return true;
      return matchKeywords(item.title, item.contentSnippet || item.content || '', source.filterKeywords);
    })
    .map(item => ({
      title: item.title || 'Untitled',
      link: item.link || '#',
      pubDate: item.pubDate || new Date().toISOString(),
      date: item.pubDate || new Date().toISOString(),
      source: source.name,
      category: source.category,
      icon: source.icon,
      contentSnippet: (item.contentSnippet || item.content || '').slice(0, 500),
      guid: item.guid || item.link || Math.random().toString(36),
    }));
  console.log(`  ${source.name}: ${items.length} items`);
  return items;
}

async function main() {
  console.log('=== AI Feed Fetcher (no API) ===');
  console.log(`Time: ${new Date().toISOString()}`);

  const allItems = [];
  for (const source of RSS_SOURCES) {
    const items = await fetchSource(source);
    allItems.push(...items);
  }

  // Deduplicate by guid
  const seen = new Set();
  const deduped = allItems.filter(item => {
    if (seen.has(item.guid)) return false;
    seen.add(item.guid);
    return true;
  });

  // Sort by date descending
  deduped.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  const output = {
    generatedAt: new Date().toISOString(),
    lookbackHours: MAX_AGE_HOURS,
    totalItems: deduped.length,
    items: deduped,
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\nDone! ${deduped.length} items saved to feed.json`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
