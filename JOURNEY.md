# The Enkidu Journey

A running log of what was actually built, in order, including mistakes. Updated as each step completes.

The goal of this log is to give future builders an honest picture of the process — not just the commands that worked, but the things that broke and why.

---

## Phase 0 — Claude API Proof of Concept

**Date:** April 12, 2026 | **Status:** ✅ Complete

### What was done
- Set up Python 3.11 environment via Anaconda
- Installed `anthropic`, `python-dotenv`, `requests`
- Created `test_claude.py` — a minimal script that calls the Claude API and prints a response
- Initialized a local git repo, pushed to GitHub

### What broke

**Dependency version conflicts.** The Anaconda base environment had older versions of packages (pydantic, requests, etc.). Pinning specific versions in requirements.txt caused install failures. Fix: use flexible version ranges (`anthropic>=0.94.0`) instead of exact pins.

**Committed .env to GitHub.** The `.env` file containing the API key was accidentally included in the first commit. GitHub's push protection caught it. Key was immediately rotated in the Anthropic console. Fix: add `.env` to `.gitignore` *before* the first commit.

**`.gitignore` didn't work.** The file was saved as `.gitignore.txt` — Windows sometimes adds the extension silently. Git never read it. Fix: rename to `.gitignore` with no extension.

**Stale model string.** `test_claude.py` was using `claude-opus-4-1-20250805`, a model ID from August 2025 that had since been rotated. Fix: update to `claude-opus-4-6` (current as of April 2026).

**Git history contained the leaked key.** Even after removing `.env` and updating `.gitignore`, the original commit still had the key embedded in history. GitHub's push protection blocked all future pushes. Fix: used `git-filter-repo` to rewrite history, scrubbing `.env` from every commit, then force-pushed.

### What was learned
- Always create `.gitignore` before the first commit and verify it's working (no `.txt` extension)
- API keys rotate — never hardcode or commit them; rotate immediately if leaked
- Git history is permanent unless you rewrite it — `git-filter-repo` is the right tool for scrubbing secrets
- Anaconda base environments accumulate cruft; flexible version pinning is safer than exact pins

### Files created
- `test_claude.py` — Claude API hello world
- `requirements.txt` — Python dependencies
- `.gitignore` — excludes `.env`, `__pycache__`, `.venv`, etc.
- `.env.example` — template for required secrets
- `.env` (not committed) — holds `ANTHROPIC_API_KEY`

---

## Phase 1 — Local Inference Setup

**Date:** April 12, 2026 | **Status:** ✅ Complete

### What was done
- Verified WSL2 was already installed (Ubuntu distro, WSL version 2) — no manual install needed
- Installed Docker Desktop 4.68.0 (Windows AMD64)
- Verified Docker engine working: `docker run --rm hello-world`
- Pulled and started Ollama container with GPU passthrough
- Pulled Gemma 4 26B model weights (~17GB) into Ollama
- Started Open WebUI — browser chat interface at localhost:3000
- Ran inference benchmark comparing local Gemma vs Claude API

### What broke

**Started pulling the wrong model.** Initially pulled `gemma3:27b` (Gemma 3) before realizing Gemma 4 was available on Ollama. Cancelled at 35% and switched to `gemma4:26b`. No harm done — partial download was discarded.

**`gemma4:latest` is not the big model.** Running `ollama pull gemma4` without a tag pulls `latest`, which maps to `e4b` — a tiny 4.5B edge model. Always specify the tag explicitly: `gemma4:26b`.

**`.venv` activation doesn't always work in PowerShell.** The terminal showed `(.venv)` in the prompt but `python` still resolved to the global Python 3.12 install. `requests` and `anthropic` weren't in the global env, causing `ModuleNotFoundError`. Fix: use `.venv/Scripts/python.exe` directly to guarantee the right interpreter.

**Gemma doesn't know where it's running.** When asked "Where do you live?", Gemma responded "Google's data centers." This is wrong — it's running on a local RTX 4090. Gemma knows its training origin (Google DeepMind) but has no awareness of its runtime environment. Open-weight models have no way to detect where they've been deployed.

### What was learned
- Docker Desktop uses WSL2 as its backend on Windows 11 — this enables GPU passthrough to Linux containers
- The `-v ollama:/root/.ollama` volume flag is critical — without it, the 18GB download disappears when the container restarts
- `--gpus all` passes the RTX 4090 through via the NVIDIA Container Toolkit (bundled with Docker Desktop)
- Gemma 4 26B is a **Mixture of Experts (MoE)** model: 25.2B total parameters, only 3.8B active per inference — fast like a 4B model, quality of a much larger one, 256K token context window
- Gemma 4 26B uses ~18GB VRAM — fits in the 4090's 24GB with ~6GB headroom
- Docker Compose is cleaner than raw `docker run` for multi-container setups — services communicate by name, one command starts the whole stack
- Ollama's streaming API returns NDJSON — each line is a JSON object; the final chunk (`done: true`) contains built-in timing stats in nanoseconds (`eval_count`, `eval_duration`), making tokens/sec trivial to calculate
- Open WebUI runs with `--restart always` — it starts automatically when Docker starts, which starts automatically on Windows boot. No manual restarts needed.
- Gemma stays in VRAM until idle for ~5 minutes (Ollama default). Set `OLLAMA_KEEP_ALIVE=-1` to keep it loaded permanently and eliminate cold starts.

### Benchmark results (cold start — model loading into VRAM for first time)

Prompt: *"Explain how a transformer neural network works. Be thorough but concise. Aim for about 200 words."*

| Metric | Gemma 4 26B (local) | Claude Opus 4.6 (cloud) |
|--------|-------------------|------------------------|
| Time to first token | 6.36s *(VRAM load penalty)* | 1.60s |
| Total time | **8.13s** | 10.20s |
| Tokens generated | 1077 | 315 |
| Tokens / second | **144 tok/s** | 31 tok/s |
| Cost | **$0** | ~$0.02 |

**Interpretation:**
- Local wins on throughput (144 vs 31 tok/s) and total time once warm
- Cloud wins on time-to-first-token — Anthropic's infrastructure is always warm; the 6s cold start only happens once per session
- Response quality was comparable — Gemma more verbose, Claude more structured
- **Routing conclusion:** use local for everyday queries (free, fast, private); use cloud only when quality is the deciding factor

### Files created
- `phase1-local-inference/docker-compose.yml` — starts Ollama + Open WebUI in one command
- `phase1-local-inference/inference_bench.py` — benchmarks local vs Claude API side-by-side

---

## Phase 2 — Tool Use and Routing Logic

**Date:** April 12, 2026 | **Status:** 🔄 In Progress

### What was done so far
- Scaffolded `phase2-tool-use/router.py` — heuristic routing logic with token count thresholds and complexity keyword detection
- Routing decision is data-backed by Phase 1 benchmark results

### Up next
- Build SEC Edgar screener tool (pull 10-K filings, extract financial data)
- Wire router into a unified `enkidu.py` entry point
- Test on real queries (stock screening, Duke Energy analysis)

---

*This log will be updated as each phase progresses.*
