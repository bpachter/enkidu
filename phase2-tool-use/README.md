# Phase 2 — Tool Use and Routing Logic

**Status: 🔄 In Progress**

Build a Python orchestrator that routes queries intelligently between local Gemma and Claude API, and integrates real tools that make the assistant actually useful for work.

**Goal:** By the end of this phase, Enkidu will answer real questions — pulling live SEC filings, screening stocks, routing complex reasoning to Claude — not just chatting.

---

## What Gets Built

### 1. Routing Logic (`router.py`) ✅ Scaffolded
Decides whether a query goes to local Gemma or Claude API based on:
- **Token count** — long prompts suggest complex tasks
- **Complexity keywords** — "analyze", "compare", "explain in depth", etc.
- **Tool requirements** — tool use routes to Claude (better function calling)
- **Explicit override** — caller can force a tier

Thresholds are informed by Phase 1 benchmark results: Gemma at 144 tok/s makes local inference fast enough for nearly all everyday queries.

Run the router standalone to see routing decisions:
```bash
python phase2-tool-use/router.py
```

### 2. SEC Edgar Screener (`tools/edgar_screener.py`) ⬜ Not started
Pull 10-K filings from the SEC's public EDGAR API and extract financial data for analysis.

Target queries:
- "What is Duke Energy's debt-to-equity ratio from their latest 10-K?"
- "Find the top 10 energy companies by Piotroski F-Score"
- "Compare capex trends for NEE, DUK, and SO over the last 3 years"

### 3. Unified Entry Point (`enkidu.py`) ⬜ Not started
A single script that:
1. Takes a user query
2. Runs it through the router
3. Calls tools if needed
4. Sends to Gemma or Claude
5. Returns the answer

---

## Architecture

```
User query
    ↓
router.py — decides LOCAL or CLOUD
    ├── LOCAL → Ollama HTTP API → gemma4:26b
    └── CLOUD → Anthropic SDK → claude-opus-4-6
                    ↓
            Tool pipeline (if needed)
            └── edgar_screener.py → SEC EDGAR API
                    ↓
            Final response
```

---

## Files

| File | Status | Purpose |
|------|--------|---------|
| `router.py` | ✅ Scaffolded | Heuristic routing: local vs cloud |
| `tools/edgar_screener.py` | ⬜ Not started | Pull SEC 10-K filings |
| `enkidu.py` | ⬜ Not started | Unified entry point |

---

## Routing Thresholds (from Phase 1 benchmarks)

| Signal | → Local | → Cloud |
|--------|---------|---------|
| Token count | < 500 tokens | > 500 tokens |
| Keyword | "what is", "list", "define" | "analyze", "compare", "explain in depth" |
| Tools needed | No | Yes |
| Default | ✅ Local | — |

Bias is intentionally toward local — free, private, and at 144 tok/s it's fast enough for most queries.

---

## Real Use Cases Being Built For

- **Stock screening:** Piotroski F-Score, Altman Z-Score, debt ratios from 10-K filings
- **Energy sector analysis:** Capex trends, regulatory filings, utility comparisons
- **General research:** Anything where privacy matters or Claude costs add up

---

## Phase 2 Learnings (updated as work progresses)

*See [JOURNEY.md](../JOURNEY.md) for detailed notes.*
