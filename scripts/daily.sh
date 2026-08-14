#!/bin/bash
# ai-feed 每日自动管线：抓取 → LLM 摘要 → 生成 HTML → 部署 GitHub Pages → 推送飞书
# 由 LaunchAgent 定时触发（或手动 bash scripts/daily.sh）
# PATH/HOME 由外层 wrapper 注入；不 set -e，单步失败不阻断后续

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG="${AI_FEED_LOG:-/tmp/ai-feed-daily.log}"

echo "=== $(date) ===" >> "$LOG"

# 1. 同步远端（先丢弃本地 feed.json 改动，避免 pull 冲突）
echo "[1/6] git pull..." >> "$LOG"
cd "$REPO_DIR"
git checkout -- data/feed.json 2>/dev/null
git pull --rebase origin main >> "$LOG" 2>&1 || echo "[1/6] git pull FAILED" >> "$LOG"

# 2. 抓取原始 RSS（无 API）
echo "[2/6] prepare-feed..." >> "$LOG"
node scripts/prepare-feed.js >> "$LOG" 2>&1 || echo "[2/6] prepare-feed FAILED" >> "$LOG"

# 3. LLM 摘要
echo "[3/6] summarize..." >> "$LOG"
node scripts/summarize.js >> "$LOG" 2>&1 || echo "[3/6] summarize FAILED" >> "$LOG"

# 4. 生成 HTML
echo "[4/6] generate-html..." >> "$LOG"
node scripts/generate-html.js >> "$LOG" 2>&1 || echo "[4/6] generate-html FAILED" >> "$LOG"

# 5. 部署 GitHub Pages（docs/ + feed.json）
echo "[5/6] deploy..." >> "$LOG"
TODAY=$(date +%Y-%m-%d)
git add docs/ data/feed.json >> "$LOG" 2>&1
git commit -m "auto: feed report ${TODAY}" >> "$LOG" 2>&1 || echo "[5/6] nothing to commit" >> "$LOG"
git push >> "$LOG" 2>&1 || echo "[5/6] git push FAILED" >> "$LOG"

# 6. 推送飞书
echo "[6/6] push-feishu..." >> "$LOG"
node scripts/push-feishu.js >> "$LOG" 2>&1 || echo "[6/6] push-feishu FAILED" >> "$LOG"

echo "Done! $(date)" >> "$LOG"
