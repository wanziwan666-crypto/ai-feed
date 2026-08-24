/**
 * config.js — ai-feed 共用配置
 *
 * LLM 供应商自动检测，优先级：
 *   1. 智谱 GLM（ZHIPU_API_KEY / GLM_API_KEY，OpenAI 兼容 /api/paas/v4）
 *   2. Anthropic 兼容端点（ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY + ANTHROPIC_BASE_URL）
 *   3. 阿里云百炼 DashScope（DASHSCOPE_API_KEY）
 * 三者都走 OpenAI 兼容协议（/v1/chat/completions），所以 summarize.js / generate-html.js 无需改动。
 *
 * Key 从环境变量或 ~/.ai-feed/.env 加载，不硬编码在源码里。
 * 画像/权重从 ~/.ai-feed/profile.json（用户覆盖）→ config/profile.json（默认）读取。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const ENV_FILE = path.join(os.homedir(), '.ai-feed', '.env');
const PROFILE_OVERRIDE = path.join(os.homedir(), '.ai-feed', 'profile.json');
const DEFAULT_PROFILE = path.join(__dirname, '..', 'config', 'profile.json');

// 读取 KEY=VALUE 文件
function readEnvFile(file) {
  try {
    const content = fs.readFileSync(file, 'utf-8');
    const vars = {};
    for (const line of content.split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (match) vars[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
    return vars;
  } catch (e) {
    return {};
  }
}

const FILE_ENV = readEnvFile(ENV_FILE);
// 环境变量优先，其次 .env
const readVar = (name) => process.env[name] || FILE_ENV[name] || '';

const DEFAULT_ZHIPU_BASE = 'https://open.bigmodel.cn/api/paas/v4';
const DEFAULT_ZHIPU_MODEL = 'glm-5.2';
const DEFAULT_ANTHROPIC_BASE = 'https://api.anthropic.com';
const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5';
const DEFAULT_DASHSCOPE_MODEL = 'qwen3.7-plus';

// KEY 支持逗号分隔多把（自动轮换见 scripts/llm.js），返回数组；单 key 也兼容
function parseKeys(raw) {
  return raw
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
}

function resolveProvider() {
  // ---- 1. 智谱 GLM（OpenAI 兼容 /api/paas/v4）----
  const zhipuKey = readVar('ZHIPU_API_KEY') || readVar('GLM_API_KEY');
  if (zhipuKey) {
    const base = (readVar('ZHIPU_BASE_URL') || DEFAULT_ZHIPU_BASE).replace(/\/+$/, '');
    return {
      provider: 'zhipu',
      apiKey: parseKeys(zhipuKey)[0],
      apiKeys: parseKeys(zhipuKey),
      // OpenAI SDK 会在 baseURL 后拼 /chat/completions
      baseUrl: /\/v\d+$/.test(base) ? base : `${base}/v4`,
      model: readVar('AI_FEED_MODEL') || DEFAULT_ZHIPU_MODEL,
    };
  }

  // ---- 2. Anthropic（含第三方兼容网关）----
  const anthropicKey = readVar('ANTHROPIC_AUTH_TOKEN') || readVar('ANTHROPIC_API_KEY');
  if (anthropicKey) {
    const base = (readVar('ANTHROPIC_BASE_URL') || DEFAULT_ANTHROPIC_BASE).replace(/\/+$/, '');
    return {
      provider: 'anthropic',
      apiKey: parseKeys(anthropicKey)[0],
      apiKeys: parseKeys(anthropicKey),
      // OpenAI SDK 会在 baseURL 后拼 /chat/completions
      baseUrl: /\/v1$/.test(base) ? base : `${base}/v1`,
      model: readVar('AI_FEED_MODEL') || DEFAULT_ANTHROPIC_MODEL,
    };
  }

  // ---- 3. DashScope 兜底 ----
  const dashscopeKey = readVar('DASHSCOPE_API_KEY');
  if (dashscopeKey) {
    return {
      provider: 'dashscope',
      apiKey: parseKeys(dashscopeKey)[0],
      apiKeys: parseKeys(dashscopeKey),
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: readVar('AI_FEED_MODEL') || DEFAULT_DASHSCOPE_MODEL,
    };
  }

  throw new Error(
    `未找到可用的 LLM API Key。请设置以下任一项（环境变量，或写入 ${ENV_FILE}）：\n` +
      '  ZHIPU_API_KEY=...（智谱 GLM，可选 AI_FEED_MODEL）\n' +
      '  ANTHROPIC_AUTH_TOKEN=...（可选 ANTHROPIC_BASE_URL、AI_FEED_MODEL）\n' +
      '  DASHSCOPE_API_KEY=...'
  );
}

function loadProfile() {
  const defaults = {
    identity: '和观众一起成长的AI学习者，面向非技术背景的普通人',
    focus: [
      '普通人能直接上手的AI工具使用方法和指南',
      'AI在日常生活和工作中的实际应用案例',
      '对使用AI的真实感受、反思和批判性思考',
      '新出的面向消费者的AI产品和功能',
      'AI对普通人学习、工作、生活的影响和趋势',
    ],
    weights: { practical: 0.3, novelty: 0.25, depth: 0.15, fit: 0.3 },
  };

  let raw = {};
  for (const file of [PROFILE_OVERRIDE, DEFAULT_PROFILE]) {
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
      break; // 优先用户覆盖
    } catch (e) {}
  }

  const identity =
    typeof raw.identity === 'string' && raw.identity.trim()
      ? raw.identity.trim()
      : defaults.identity;
  const focus =
    Array.isArray(raw.focus) && raw.focus.length > 0
      ? raw.focus.filter((f) => typeof f === 'string')
      : defaults.focus;
  const weights = { ...defaults.weights };
  if (raw.weights) {
    for (const key of Object.keys(defaults.weights)) {
      if (typeof raw.weights[key] === 'number') weights[key] = raw.weights[key];
    }
  }

  const focusText = focus.map((f, i) => `${i + 1}. ${f}`).join('\n');
  return { identity, focus, focusText, weights };
}

const PROFILE = loadProfile();
const SCORE_WEIGHTS = PROFILE.weights;
// 飞书推送收件人（push-feishu.js 用）。不涉及 LLM，缺失时返回空串由调用方报错
const FEISHU_USER_OPEN_ID = readVar('FEISHU_USER_OPEN_ID');

module.exports = { SCORE_WEIGHTS, PROFILE, FEISHU_USER_OPEN_ID };

// LLM 相关字段做成惰性 getter：只有真正用到时才解析/报错。
// 这样 push-feishu.js 只取 FEISHU_USER_OPEN_ID 时，不会因缺 LLM key 而失败。
let _resolved = null;
const resolved = () => (_resolved || (_resolved = resolveProvider()));
for (const [key, pick] of [
  ['API_KEY', (r) => r.apiKey],
  ['API_KEYS', (r) => r.apiKeys],
  ['BASE_URL', (r) => r.baseUrl],
  ['MODEL', (r) => r.model],
  ['PROVIDER', (r) => r.provider],
]) {
  Object.defineProperty(module.exports, key, {
    enumerable: true,
    get: () => pick(resolved()),
  });
}
