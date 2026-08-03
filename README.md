# AI Feed

Multi-source RSS aggregation + AI-powered Chinese summarization for AI industry intelligence. **Zero API keys required.**

Follow builders, educators, and AI thinkers — get curated summaries of what matters for ordinary people learning AI.

## Quick Start

1. Install the skill in your AI agent (Claude Code, OpenClaw, or similar)
2. Say "获取AI资讯" or "fetch AI feed"
3. Your agent fetches the central feed, processes it with its own intelligence, and delivers a digest

**No API keys. No configuration. It just works.**

## How It Works

1. **Central feed** — GitHub Actions fetches 14+ RSS sources every 6 hours, storing raw articles in `data/feed.json`
2. **Agent processes** — Your AI agent reads the feed and generates Chinese summaries, topic tags, and 4-dimensional quality scores using its own intelligence
3. **Daily narrative** — The agent weaves the top stories into a readable narrative, not just a list

## Sources

### Builders
Karpathy, Simon Willison, Nathan Lambert (Interconnects), Anthropic Engineering

### Voices (Consumer-facing AI thinkers)
Ethan Mollick (One Useful Thing), AI Snake Oil, Not Boring, Stratechery

### Projects & Tools
Hacker News Show HN, Product Hunt AI, MIT Tech Review, VentureBeat

### AI Education
EdSurge, Khan Academy Blog

## Customization

Override the default profile by creating `~/.ai-feed/profile.json`:

```json
{
  "identity": "your identity here",
  "focus": ["your content focus areas"],
  "weights": { "practical": 0.3, "novelty": 0.25, "depth": 0.15, "fit": 0.3 }
}
```

## Scheduled Runs (optional)

Just tell your agent "设置定时抓取" / "set up a daily fetch" and it will walk you through it. Two options:

- **A. Scheduled fetch (recommended, still zero keys)** — a cron job refreshes the raw articles in the background; you say "获取AI资讯" whenever you want and your agent writes the digest on the spot.
- **B. Scheduled push** — get a finished digest delivered to your phone or inbox at a fixed time without touching your computer. This one *does* need your own LLM API key, because no agent is present when cron fires — something has to write the summaries. Your key goes in `~/.ai-feed/.env`, never in this repo.

Most people want A. See the 定时任务 section in `SKILL.md` for the full walkthrough.

## Philosophy

- **Follow people, not just feeds** — Builder and voice sources provide original thinking
- **For ordinary people** — Content is filtered and scored for non-technical AI learners
- **Zero friction** — No API keys, no config files to edit (a key is only needed for optional scheduled push)

## License

MIT
