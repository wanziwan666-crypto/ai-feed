/**
 * push-feishu.js — 每日日报链接通知：飞书只推一条消息，带当天报告的链接。
 * 内容(标题/摘要/评分)都在 HTML 报告页里,消息本体只做"日报已更新"的提醒;
 * 因此不再按条目推送,也就没有未推送积压。同一天只推一次。
 *
 * 用法: node scripts/push-feishu.js            → 推今天（写去重标记）
 *      node scripts/push-feishu.js 2026-11-04  → 补推指定历史日期（不写去重标记，消息标"补发"）
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

// 可选参数：补推历史日期 YYYY-MM-DD
const argDate = process.argv[2];
if (argDate && !/^\d{4}-\d{2}-\d{2}$/.test(argDate)) {
  console.error('日期参数格式应为 YYYY-MM-DD');
  process.exit(1);
}
const TARGET = argDate || dateStr();
const IS_TODAY = !argDate;

// 报告链接优先指向当天归档页（旧消息里的链接不随首页更新"变内容"）；归档未生成时回退首页
function reportUrl() {
  const archiveExists = fs.existsSync(path.join(__dirname, '..', 'docs', `${TARGET}.html`));
  return archiveExists ? `${SITE_BASE}${TARGET}.html` : SITE_BASE;
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
  if (IS_TODAY && state.reportPushedDate === TARGET) {
    console.log('今天已推送过日报链接，跳过');
    return;
  }

  // 今日新内容条数（近 24h 有摘要的）；补发历史日期时不数条数——feeds.json 只留最近条目，
  // 数出来和归档页对不上，宁可不写
  let count = null;
  if (IS_TODAY) {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    const dayAgo = Date.now() - 24 * 3600 * 1000;
    count = (data.items || []).filter(
      (i) => i.summary && new Date(i.pubDate).getTime() > dayAgo
    ).length;
  }

  const [y, m, d] = TARGET.split('-');
  const zhToday = `${y}/${Number(m)}/${Number(d)}`; // 如 2026/11/4
  const shortDate = `${Number(m)}/${Number(d)}`; // 11/4
  const content = [];
  const head = IS_TODAY
    ? `📡 AI 资讯日报 · ${zhToday}\n今日 ${count} 条新内容已更新\n`
    : `📡 AI 资讯日报 · ${zhToday}（补发）\n当日推送故障，现补发归档链接\n`;
  content.push([{ tag: 'text', text: head }]);
  content.push([
    { tag: 'text', text: '👉 ' },
    { tag: 'a', text: `查看完整报告（${shortDate}）`, href: reportUrl() },
  ]);

  const title = IS_TODAY ? `AI 资讯日报 · ${zhToday}` : `AI 资讯日报 · ${zhToday}（补发）`;
  const postContent = { zh_cn: { title, content } };
  const body = {
    receive_id: USER_OPEN_ID,
    msg_type: 'post',
    content: JSON.stringify(postContent),
  };

  console.log(IS_TODAY ? `推送日报链接通知（今日 ${count} 条）...` : `补推 ${TARGET} 日报链接...`);
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
      if (IS_TODAY) {
        state.reportPushedDate = TARGET;
        savePushed(state);
        console.log('已记录推送日期，今天不会重复推送');
      } else {
        console.log('补发历史日期，不写入去重标记');
      }
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
