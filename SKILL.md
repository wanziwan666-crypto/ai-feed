---
name: ai-feed
description: |
  Multi-source RSS aggregation + AI-powered Chinese summarization for AI industry intelligence.
  Use this skill whenever the user wants to: fetch latest AI news, aggregate RSS feeds, get AI industry updates,
  check what's trending in AI, "抓取AI资讯", "RSS抓取", "AI信息聚合", "看看最近AI有什么新东西", "帮我收集AI动态",
  "获取AI资讯", "生成资讯HTML", "run ai-feed", "update ai feed", "refresh feed".
  No API keys required — all AI processing is done by the agent itself.
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

## Quick Reference

用户说"获取AI资讯"时，执行完整流程：

```bash
cat data/feed.json   # 读取中心 feed
```

然后 Agent 按规则处理内容、生成报告、呈现给用户。
