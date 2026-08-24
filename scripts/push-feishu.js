/**
 * push-feishu.js — 每日日报链接通知：飞书只推一条消息，带当天报告的链接。
 * 内容(标题/摘要/评分)都在 HTML 报告页里,消息本体只做"日报已更新"的提醒;
 * 因此不再按条目推送,也就没有未推送积压。同一天只推一次。
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

if (!USER_OPEN_ID) {
  console.error(
    '未配置 FEISHU_USER_OPEN_ID。请在 ~/.ai-feed/.env 中设置 FEISHU_USER_OPEN_ID=ou_xxx，\n' +
      '或导出环境变量。获取方式：lark-cli 登录后查询自己的 open_id。'
  );
  process.exit(1);
}

function dateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 报告链接优先指向当天归档页（旧消息里的链接不随首页更新"变内容"）；归档未生成时回退首页
function reportUrl() {
  const archiveExists = fs.existsSync(path.join(__dirname, '..', 'docs', `${dateStr()}.html`));
  return archiveExists ? `${SITE_BASE}${dateStr()}.html` : SITE_BASE;
}

function readPushed() {
  try {
    if (fs.existsSync(PUSHED_FILE)) return JSON.parse(fs.readFileSync(PUSHED_FILE, 'utf-8'));
  } catch (e) {}
  return { guids: [] }; // guids 为旧的按条目推送时代的历史记录,仅存档
}

function savePushed(state) {
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(PUSHED_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

function main() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error('feeds.json 不存在，请先运行 summarize.js');
    process.exit(1);
  }

  const state = readPushed();
  const today = dateStr();
  if (state.reportPushedDate === today) {
    console.log('今天已推送过日报链接，跳过');
    return;
  }

  // 今日新内容条数（近 24h 有摘要的）
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const count = (data.items || []).filter(
    (i) => i.summary && new Date(i.pubDate).getTime() > dayAgo
  ).length;

  const zhToday = new Date().toLocaleDateString('zh-CN'); // 如 2026/8/24
  const shortDate = zhToday.split('/').slice(1).join('/'); // 8/24
  const content = [];
  content.push([{ tag: 'text', text: `📡 AI 资讯日报 · ${zhToday}\n今日 ${count} 条新内容已更新\n` }]);
  content.push([
    { tag: 'text', text: '👉 ' },
    { tag: 'a', text: `查看完整报告（${shortDate}）`, href: reportUrl() },
  ]);

  const postContent = { zh_cn: { title: `AI 资讯日报 · ${zhToday}`, content } };
  const body = {
    receive_id: USER_OPEN_ID,
    msg_type: 'post',
    content: JSON.stringify(postContent),
  };

  console.log(`推送日报链接通知（今日 ${count} 条）...`);
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
      state.reportPushedDate = today;
      savePushed(state);
      console.log('已记录推送日期，今天不会重复推送');
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
