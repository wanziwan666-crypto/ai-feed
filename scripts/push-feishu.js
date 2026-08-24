/**
 * push-feishu.js — 读取 data/feeds.json，把最新未推送的内容以富文本格式推送到飞书
 * 每条含：标题（可点击原文链接）+ 摘要 + 分数 + 标签，末尾附完整 HTML 报告链接
 * 推送去重：记录已推送 guid 到 data/pushed.json，每次只推未推过的
 * 排序：时间倒序（最新优先），同时间按分数降序
 *
 * 用法: node scripts/push-feishu.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { FEISHU_USER_OPEN_ID: USER_OPEN_ID } = require('./config');

const DATA_FILE = path.join(__dirname, '..', 'data', 'feeds.json');
const PUSHED_FILE = path.join(__dirname, '..', 'data', 'pushed.json');
const SITE_BASE = 'https://wanziwan666-crypto.github.io/ai-feed/';
const LARK_CLI = fs.existsSync(path.join(os.homedir(), '.npm-global/bin/lark-cli'))
  ? path.join(os.homedir(), '.npm-global/bin/lark-cli')
  : 'lark-cli';
const MAX_PUSH = 5;

// 报告链接优先指向当天归档页（旧消息里的链接不再随首页更新"变内容"）；归档未生成时回退首页
function reportUrl() {
  const d = new Date();
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const archiveExists = fs.existsSync(path.join(__dirname, '..', 'docs', `${dateStr}.html`));
  return archiveExists ? `${SITE_BASE}${dateStr}.html` : SITE_BASE;
}

if (!USER_OPEN_ID) {
  console.error(
    '未配置 FEISHU_USER_OPEN_ID。请在 ~/.ai-feed/.env 中设置 FEISHU_USER_OPEN_ID=ou_xxx，\n' +
      '或导出环境变量。获取方式：lark-cli 登录后查询自己的 open_id。'
  );
  process.exit(1);
}

function loadPushed() {
  try {
    if (fs.existsSync(PUSHED_FILE)) {
      const data = JSON.parse(fs.readFileSync(PUSHED_FILE, 'utf-8'));
      return new Set(data.guids || []);
    }
  } catch (e) {}
  return new Set();
}

function savePushed(newGuids) {
  const existing = loadPushed();
  newGuids.forEach((g) => existing.add(g));
  const all = [...existing];
  const trimmed = all.slice(-500);
  fs.writeFileSync(
    PUSHED_FILE,
    JSON.stringify({ guids: trimmed, updatedAt: new Date().toISOString() }, null, 2),
    'utf-8'
  );
}

function main() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error('feeds.json 不存在，请先运行 summarize.js');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  const allItems = (data.items || []).filter((i) => i.summary);
  if (allItems.length === 0) {
    console.log('没有带摘要的内容，跳过推送');
    return;
  }

  const pushed = loadPushed();
  let candidates = allItems.filter((i) => i.guid && !pushed.has(i.guid));
  if (candidates.length === 0) {
    console.log('没有新内容需要推送（所有内容已推送过）');
    return;
  }

  candidates.sort((a, b) => {
    const timeDiff = new Date(b.pubDate) - new Date(a.pubDate);
    if (Math.abs(timeDiff) < 1000) return (b.score || 3) - (a.score || 3);
    return timeDiff;
  });
  const top = candidates.slice(0, MAX_PUSH);

  const today = new Date().toLocaleDateString('zh-CN');
  const content = [];
  content.push([
    { tag: 'text', text: `📡 AI 资讯日报 · ${today}\n本期 ${top.length} 条新内容（时间排序）：\n` },
  ]);

  top.forEach((item, idx) => {
    const score = item.score != null ? `⭐${Number(item.score).toFixed(1)}` : '';
    const tags = (item.topics || []).slice(0, 3).join(' / ');
    const summary = (item.summary || '').slice(0, 100);

    content.push([
      { tag: 'text', text: `${idx + 1}. ${score} ` },
      { tag: 'a', text: (item.title || '').slice(0, 60), href: item.link || '#' },
    ]);

    if (summary) content.push([{ tag: 'text', text: `   ${summary}\n` }]);

    const meta = [];
    if (item.source) meta.push(`来源: ${item.source}`);
    if (tags) meta.push(`标签: ${tags}`);
    content.push([{ tag: 'text', text: `   ${meta.join(' | ')}\n\n` }]);
  });

  content.push([
    { tag: 'text', text: '👉 ' },
    { tag: 'a', text: '查看完整 HTML 报告', href: reportUrl() },
  ]);

  const postContent = {
    zh_cn: { title: `AI 资讯日报 · ${today}`, content },
  };
  const body = {
    receive_id: USER_OPEN_ID,
    msg_type: 'post',
    content: JSON.stringify(postContent),
  };

  console.log(`准备推送 ${top.length} 条新内容到飞书...`);
  try {
    const output = execFileSync(
      LARK_CLI,
      [
        'api', 'POST', '/open-apis/im/v1/messages',
        '--as', 'bot',
        '--params', JSON.stringify({ receive_id_type: 'open_id' }),
        '--data', JSON.stringify(body),
      ],
      { encoding: 'utf-8', timeout: 30000 }
    );

    const result = JSON.parse(output);
    if (result.ok) {
      console.log('✅ 推送成功! message_id:', result.data.message_id);
      console.log(`推送了 ${top.length} 条新内容`);
      savePushed(top.map((i) => i.guid));
      console.log('已记录推送历史，下次不会重复推送这些内容');
    } else {
      console.error('❌ 推送失败:', (result.error && result.error.message) || output.slice(0, 200));
      process.exit(1);
    }
  } catch (e) {
    console.error('❌ 执行 lark-cli 失败:', e.message);
    process.exit(1);
  }
}

main();
