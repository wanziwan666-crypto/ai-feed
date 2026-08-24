#!/bin/bash
# ai-feed 每日自动管线：抓取 → LLM 摘要 → 生成 HTML → 部署 GitHub Pages → 推送飞书
# 由 LaunchAgent 定时触发（或手动 bash scripts/daily.sh）
# PATH/HOME 由外层 wrapper 注入；不 set -e，单步失败不阻断后续

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG="${AI_FEED_LOG:-/tmp/ai-feed-daily.log}"
MARKER="$REPO_DIR/data/.last-success-date"

# 当天已成功跑完则跳过（防止 RunAtLoad 开机补跑与 11:00 定时跑重复烧钱）
TODAY_MARKER="$(date +%Y-%m-%d)"
if [ -f "$MARKER" ] && [ "$(cat "$MARKER")" = "$TODAY_MARKER" ]; then
  echo "=== $(date) 今天已成功运行过，跳过 ===" >> "$LOG"
  exit 0
fi

# git 直连 GitHub 会被间歇性掐断：lowSpeed 让卡死的传输 60s 内自行中断，交给 retry 重试
# 全局配置了代理 http://127.0.0.1:7890（ClashX Pro）；若本次运行时代理未启动，则临时降级直连
GIT_NET_OPTS=(-c http.lowSpeedLimit=1 -c http.lowSpeedTime=60)
if ! nc -z -w 2 127.0.0.1 7890 2>/dev/null; then
  echo "[warn] 代理 127.0.0.1:7890 未运行（ClashX Pro 没开？），本次直连 GitHub" >> "$LOG"
  GIT_NET_OPTS+=(-c http.https://github.com.proxy=)
fi

# 重试辅助：retry <最大次数> <初始等待秒> <命令...>，等待时间翻倍递增（30→60→120...）
retry() {
  local max=$1 delay=$2 attempt=1
  shift 2
  while [ "$attempt" -le "$max" ]; do
    if "$@" >> "$LOG" 2>&1; then return 0; fi
    echo "[retry] 第 ${attempt}/${max} 次失败，${delay}s 后重试" >> "$LOG"
    sleep "$delay"
    attempt=$((attempt + 1))
    delay=$((delay * 2))
  done
  return 1
}

# 看门狗：run_timed <秒> <命令...> —— macOS 无 timeout(1)，借 perl 的 alarm 实现（定时器跨 exec 仍有效）。
# 2026-08-22 事故：prepare-feed.js 因超时 socket 未释放挂死 2 天，launchd 视任务为运行中，
# 后续每天的定时触发全被跳过。任何 node 步骤挂死最多卡到上限，由上层按失败处理。
run_timed() {
  local secs=$1; shift
  perl -e 'alarm shift; exec @ARGV' "$secs" "$@"
}

# 统计 feed.json 里的条目数（文件损坏/不存在返回 0）
feed_count() {
  node -e "try{const f=require('$REPO_DIR/data/feed.json');console.log(Array.isArray(f.items)?f.items.length:0)}catch(e){console.log(0)}"
}

echo "=== $(date) ===" >> "$LOG"

# 1. 同步远端（先丢弃本地 feed.json 改动，避免 pull 冲突）
echo "[1/6] git pull..." >> "$LOG"
cd "$REPO_DIR"
git checkout -- data/feed.json 2>/dev/null
retry 3 30 git "${GIT_NET_OPTS[@]}" pull --rebase origin main \
  || echo "[1/6] git pull FAILED（已重试 3 次，继续执行，但可能与远端分叉）" >> "$LOG"

# 2. 抓取原始 RSS（无 API）。抓到 0 条几乎必为网络中断，重试 3 次仍为 0 则中止整条管线
echo "[2/6] prepare-feed..." >> "$LOG"
FETCH_OK=0
for attempt in 1 2 3; do
  run_timed 1200 node scripts/prepare-feed.js >> "$LOG" 2>&1 \
    || echo "[watchdog] prepare-feed 1200s 超时被杀（结果以 feed.json 现状为准）" >> "$LOG"
  N=$(feed_count)
  if [ "$N" -gt 0 ]; then FETCH_OK=1; break; fi
  echo "[2/6] 第 ${attempt}/3 次抓到 0 条，疑似网络中断" >> "$LOG"
  [ "$attempt" -lt 3 ] && sleep 60
done
if [ "$FETCH_OK" -ne 1 ]; then
  echo "[abort] 连续 3 次抓取 0 条，中止本次管线（不生成空报告、不部署、不推飞书），待下次定时任务重试" >> "$LOG"
  exit 1
fi
echo "[2/6] 抓到 ${N} 条" >> "$LOG"

# 3. LLM 摘要
echo "[3/6] summarize..." >> "$LOG"
run_timed 1800 node scripts/summarize.js >> "$LOG" 2>&1 || echo "[3/6] summarize FAILED（或 1800s 看门狗超时）" >> "$LOG"

# 4. 生成 HTML
echo "[4/6] generate-html..." >> "$LOG"
run_timed 300 node scripts/generate-html.js >> "$LOG" 2>&1 || echo "[4/6] generate-html FAILED（或 300s 看门狗超时）" >> "$LOG"

# 5. 部署 GitHub Pages（docs/ + feed.json）
echo "[5/6] deploy..." >> "$LOG"
TODAY=$(date +%Y-%m-%d)
git add docs/ data/feed.json >> "$LOG" 2>&1
git commit -m "auto: feed report ${TODAY}" >> "$LOG" 2>&1 || echo "[5/6] nothing to commit" >> "$LOG"
retry 5 30 git "${GIT_NET_OPTS[@]}" push \
  || echo "[5/6] git push FAILED（已重试 5 次；本地提交已保留，网络恢复后手动 git push 即可）" >> "$LOG"

# 6. 推送飞书
echo "[6/6] push-feishu..." >> "$LOG"
run_timed 120 node scripts/push-feishu.js >> "$LOG" 2>&1 || echo "[6/6] push-feishu FAILED（或 120s 看门狗超时）" >> "$LOG"

# 全部步骤结束（含可能失败）后记录当天已运行，避免 RunAtLoad 重复触发
echo "$TODAY_MARKER" > "$MARKER"

echo "Done! $(date)" >> "$LOG"
