---
name: ai-feed
description: |
  Multi-source RSS aggregation + AI-powered Chinese summarization for AI industry intelligence.
  Use this skill whenever the user wants to: fetch latest AI news, aggregate RSS feeds, get AI industry updates,
  check what's trending in AI, "抓取AI资讯", "RSS抓取", "AI信息聚合", "看看最近AI有什么新东西", "帮我收集AI动态",
  "获取AI资讯", "生成资讯HTML", "run ai-feed", "update ai feed", "refresh feed".
  Also triggers for scheduling requests: "设置定时抓取", "每天自动抓取AI资讯", "定时推送日报",
  "set up cron for ai-feed", "schedule daily fetch", "自动推送到飞书/Telegram".
  No API keys required for on-demand use — all AI processing is done by the agent itself.
  (Optional scheduled push needs a user-provided LLM key; see the 定时任务 section.)
---

# AI Feed — 零 API Key 的 AI 资讯聚合

聚合多个 RSS 源的 AI 行业新闻，按相关性过滤，生成中文摘要和评分。

**核心理念：** 用户无需配置任何 API key。原始内容由中心化 GitHub Actions 每日抓取，AI 摘要由 Agent 自身能力完成。

## How It Works

1. **中心化 feed**：GitHub Actions 每日自动抓取所有 RSS 源，原始数据存储在 `data/feed.json`
2. **Agent 拉取**：Agent 读取 `data/feed.json`（一次文件读取，无网络请求、无 API key）
3. **Agent 处理**：Agent 按照 `prompts/` 目录下的规则，对每篇文章生成中文摘要、标签和评分
4. **Agent 输出**：Agent 生成 HTML 报告或 markdown digest，呈现给用户

## Project Location

```
ai-feed/
├── SKILL.md                  # 本文件 — Agent 指令
├── scripts/
│   └── prepare-feed.js       # RSS 抓取器（GitHub Actions 运行，无 API 调用）
├── prompts/
│   ├── summarize.md          # 摘要生成规则
│   ├── score.md              # 四维评分标准
│   └── digest.md             # 今日叙事写作规则
├── config/
│   ├── sources.json          # RSS 源列表（中心化维护）
│   └── profile.json          # 默认账号定位（用户可覆盖）
└── data/
    └── feed.json             # 中心 feed 数据（GitHub Actions 自动更新）
```

## Content Delivery — Digest 生成流程

当用户说"获取AI资讯"或类似指令时，执行以下流程：

### Step 1: 读取数据

读取 `data/feed.json`。这个文件包含最近 72 小时内所有 RSS 源的原始文章。
每条数据包含：`title`, `link`, `pubDate`, `source`, `category`, `icon`, `contentSnippet`, `guid`。

如果文件不存在或为空，告诉用户："暂无新内容，请稍后再试。"

### Step 2: 读取配置

读取 `config/profile.json` 获取账号定位（identity + focus + weights）。
用户可以在 `~/.ai-feed/profile.json` 放置自定义配置覆盖默认值。

### Step 3: 逐条处理

对 `feed.json` 中的每篇文章，按 `prompts/summarize.md` 和 `prompts/score.md` 的规则：
1. 判断是否与 AI 相关、对普通人有学习价值。无关内容（N/A）跳过。
2. 生成一句话中文摘要（不超过 50 字）
3. 生成 2-3 个主题标签
4. 打四维评分：实操(practical 1-5)、增量(novelty 1-5)、深度(depth 1-5)、匹配(fit 1-5)
5. 计算加权总分（按 profile.json 中的 weights）

### Step 4: 生成今日叙事

取总分最高的 5-8 篇文章，按 `prompts/digest.md` 的规则，用普通人能听懂的话串成一段叙事（80-150 字）。

### Step 5: 输出

生成一个简洁的 HTML 报告或 markdown digest，包含：
- 今日叙事段落
- 按分区展示的文章卡片（每条含标题、摘要、评分、来源、时间）
- 保存到 `data/feed-report-{date}.html`

### Step 6: 呈现

向用户展示报告路径，并用文字简要概括今天最重要的 3 条内容。

## RSS Sources

源列表在 `config/sources.json` 中维护，中心化更新。用户无需自己管理源。

| Source | Category | 
|:---|:---|
| Karpathy · Blog | builders |
| Simon Willison | builders |
| Nathan Lambert | builders |
| Anthropic Engineering | builders |
| Ethan Mollick · One Useful Thing | voices |
| AI Snake Oil | voices |
| Not Boring | voices |
| Stratechery | voices |
| Hacker News · Show HN | projects |
| Product Hunt · AI | new-tools |
| EdSurge · Education Tech | ai-education |
| Khan Academy · Blog | ai-education |
| MIT Tech Review | new-tools |
| VentureBeat | new-tools |

## User Configuration

用户可以在 `~/.ai-feed/` 放置自定义配置：

```json
// ~/.ai-feed/profile.json
{
  "identity": "和观众一起成长的AI学习者，面向非技术背景的普通人",
  "focus": [
    "普通人能直接上手的AI工具使用方法和指南",
    "AI在日常生活和工作中的实际应用案例",
    "对使用AI的真实感受、反思和批判性思考",
    "新出的面向消费者的AI产品和功能",
    "AI对普通人学习、工作、生活的影响和趋势"
  ],
  "weights": { "practical": 0.3, "novelty": 0.25, "depth": 0.15, "fit": 0.3 }
}
```

如果没有自定义配置，使用 `config/profile.json` 中的默认值。

## 定时任务（可选）

用户说"设置定时"、"每天自动抓取"、"自动推送"时，走这一节。

**先理解一件事再往下做：** 摘要是 Agent 生成的，而定时任务触发时通常没有 Agent 在场。所以"定时"有两种完全不同的含义，成本差很多。**必须先问清用户要哪种，不要默认帮用户配 key。**

### Step 1: 问清要哪一种

原样问用户：

> 定时任务有两种做法：
>
> **A. 定时抓取（推荐，零配置）** — 后台定时更新原始文章，你早上跟我说一句"获取AI资讯"，我立刻生成摘要。不需要 API key。
> **B. 定时推送** — 每天固定时间自动把带摘要的日报发到你的手机/邮箱，完全不用开电脑。但这需要你自己配一个 LLM API key（因为没有我在场，得有别的模型来写摘要）。
>
> 你要哪种？

### Step 2A: 定时抓取（无需 key）

只需要一行 crontab。先确认两件事 —— **不要猜，都要实测**：项目克隆在哪，以及 `node` 的绝对路径。

```bash
FEED_DIR="$(pwd)"            # 确认这是 ai-feed 项目根目录
NODE_BIN="$(command -v node)" # 必须用绝对路径，见下方说明
cd "$FEED_DIR" && npm install    # 首次需要，只装 rss-parser
# 每天 8:00 抓取
(crontab -l 2>/dev/null; echo "0 8 * * * cd $FEED_DIR && $NODE_BIN scripts/prepare-feed.js >> /tmp/ai-feed-cron.log 2>&1") | crontab -
```

**为什么 `node` 必须写绝对路径：** cron 的 PATH 极简（通常只有 `/usr/bin:/bin`），而 node 常装在 `/usr/local/bin`、`/opt/homebrew/bin` 或 nvm 目录下。直接写 `node` 或 `/usr/bin/env node` 会报 `node: No such file or directory` 并静默失败。用 `command -v node` 取到真实路径填进去。

装完必须验证，不要假定成功：

```bash
crontab -l | grep prepare-feed          # 确认条目写进去了
# 模拟 cron 的干净环境实测一次，这才能验出 PATH 问题
env -i HOME="$HOME" PATH=/usr/bin:/bin sh -c "cd $FEED_DIR && $NODE_BIN scripts/prepare-feed.js" | tail -2
node -e "const j=require('$FEED_DIR/data/feed.json');console.log('条目',j.totalItems,'| 生成于',j.generatedAt)"
```

然后告诉用户：定时任务已装好，每天 8:00 后台更新文章；想看日报时说一句"获取AI资讯"即可。

注意：macOS 上 cron 需要在系统设置里给终端授予"完全磁盘访问权限"，否则可能静默失败 —— 如果 `/tmp/ai-feed-cron.log` 一直是空的，让用户检查这一项。

另一个常见坑：如果用户靠代理访问部分 RSS 源（Karpathy、Stratechery 等在部分地区需要），cron 同样不继承代理变量，抓取会卡住直到超时。这种情况把代理也写进 crontab 条目：

```bash
0 8 * * * cd $FEED_DIR && https_proxy=http://127.0.0.1:7890 $NODE_BIN scripts/prepare-feed.js >> /tmp/ai-feed-cron.log 2>&1
```

日志里若出现某些源 `0 items` 而手动跑正常，基本就是这个原因。

### Step 2B: 定时推送（需要 key）

这条路要 Agent 之外的模型来写摘要，所以需要 key。按顺序做：

**1. 让用户准备 key。** 任选一家：Anthropic（`console.anthropic.com`）、阿里云百炼（`bailian.console.aliyun.com`，国内直连）、或任何 OpenAI 兼容端点。

**2. 写入 `~/.ai-feed/.env`** —— 放 home 目录下，不在项目里，绝不会被 git 提交：

```bash
mkdir -p ~/.ai-feed && chmod 700 ~/.ai-feed
cat > ~/.ai-feed/.env << 'EOF'
# 二选一即可
ANTHROPIC_AUTH_TOKEN=sk-ant-xxx
ANTHROPIC_BASE_URL=https://api.anthropic.com
AI_FEED_MODEL=claude-haiku-4-5
# DASHSCOPE_API_KEY=sk-xxx
EOF
chmod 600 ~/.ai-feed/.env
```

**为什么必须写文件而不是 `export`：** cron 启动的进程不会 source `~/.zshrc` 或 `~/.bashrc`，环境变量在那里是拿不到的。这是这类定时任务最常见的失败原因。

**3. 提醒用户两件事，不要跳过：**
- 摘要模型建议选便宜的（如 `claude-haiku-4-5` / `qwen-turbo`）—— 每天几十篇文章逐条调用，用贵模型成本会明显上升
- 如果填的 `ANTHROPIC_BASE_URL` 是第三方中转网关而非官方端点，请求内容会经过该第三方，需自行判断是否接受

**4. 推送渠道**由用户自己选（飞书/Telegram/邮件/Bark 等），本仓库不内置。Agent 应根据用户选的渠道帮其写推送脚本，并把收件人 ID 一并放进 `~/.ai-feed/.env`（如 `FEISHU_USER_OPEN_ID=ou_xxx`），**不要硬编码进任何会提交的文件**。

**5. 验证**：手动跑一次完整链路，确认用户真的收到了推送，再告诉用户装好了。

### 通用注意事项

- **key 只放 `~/.ai-feed/.env`**（权限 600）。本仓库的 `.gitignore` 已挡住 `.env`，但仍不要把 key 写进项目目录任何文件。
- 用户想改时间：`crontab -e` 编辑，或重跑上面命令前先 `crontab -l | grep -v prepare-feed | crontab -` 清掉旧条目，避免重复。
- 卸载：`crontab -l | grep -v prepare-feed | crontab -`


## Quick Reference

用户说"获取AI资讯"时，执行完整流程：

```bash
cat data/feed.json   # 读取中心 feed
```

然后 Agent 按规则处理内容、生成报告、呈现给用户。
