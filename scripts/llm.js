/**
 * llm.js — 多 key 自动轮换的 LLM chat 客户端（summarize.js / generate-html.js 共用）
 *
 * ZHIPU_API_KEY 支持逗号分隔多把 key。某把 key 返回 429（余额不足/限速）或 401/403 时
 * 自动切下一把，成功后粘性记住当前可用的 key（本次进程内不再回切）。
 * 网络错误/超时/5xx 不轮换（换 key 也一样），直接抛给调用方的重试逻辑。
 */
const OpenAI = require('openai');
const { API_KEYS, BASE_URL } = require('./config');

const clients = API_KEYS.map((k) => new OpenAI({ apiKey: k, baseURL: BASE_URL }));
let active = 0;

async function chatCreate(params) {
  let lastErr;
  for (let i = 0; i < clients.length; i++) {
    const idx = (active + i) % clients.length;
    try {
      const resp = await clients[idx].chat.completions.create(params);
      active = idx;
      return resp;
    } catch (e) {
      lastErr = e;
      const status = e?.status;
      if (status !== 401 && status !== 403 && status !== 429) throw e;
      console.error(
        `[key-failover] 第 ${idx + 1}/${clients.length} 把 key 不可用（HTTP ${status} ${String(e.message).slice(0, 80)}），尝试下一把...`
      );
    }
  }
  throw lastErr;
}

module.exports = { chatCreate };
