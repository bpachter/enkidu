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

### What was built

**Routing logic (`phase2-tool-use/router.py`)**
- Heuristic router that classifies every query as LOCAL (Gemma) or CLOUD (Claude)
- Signals that push to cloud: prompt length > 500 tokens, complexity keywords (analyze, compare, explain why, etc.), tool requirements
- Default is LOCAL — biases toward free and private
- Routing decision carries a reason string and estimated token count, printed before each response

**Unified entry point (`enkidu.py`)**
- Single REPL loop replacing the separate test scripts from Phase 1
- Streams from Ollama (local) or Anthropic SDK (cloud) based on routing decision
- Session stats tracking: queries sent, local vs cloud split, total tokens
- Slash commands: `/local`, `/cloud`, `/stats`, `/refresh`, `/exit`

**Tool: system_info (`phase2-tool-use/tools/system_info.py`)**
- Pattern: Python fetches real data → injected as `[SYSTEM CONTEXT]` block → LLM reasons over it
- Queries `nvidia-smi` for GPU temperature, VRAM, clock speed, power draw
- Queries `psutil` for CPU % and RAM usage
- Trigger keywords: "gpu", "vram", "temperature", "cpu", "ram", etc.
- Before this tool: Gemma would answer hardware questions by hallucinating. After: it reports real live numbers.

**Tool: edgar_screener (`phase2-tool-use/tools/edgar_screener.py`)**
- Queries the QuantitativeValue processed datasets (1,294 screened stocks, 186K rows of fundamentals)
- Handles three query types: specific ticker lookup, top-N by value composite, filtered by F-Score/debt
- Falls back from screened portfolio → full metrics dataset for tickers that didn't pass the screen (e.g., DUK — Duke Energy is a utility, excluded by the quant value methodology)
- `/refresh` command wipes cached EDGAR JSON files and re-runs the full QuantitativeValue pipeline (~66 min)
- Refresh shows a time estimate broken down by stage before asking for confirmation

### What broke

**Column names didn't match the actual CSVs.**
Exploring the data in Windows Explorer showed column names like `overall_rank`, `quality_rank`, `value_rank`. None of those exist in the actual files. Actual columns are `value_composite`, `quality_score`, `p_franchise_power`, `ev_ebit_rank`. Always query the real file rather than trusting UI previews.

**DUK not in the screened portfolio.**
Duke Energy (DUK) didn't pass the quantitative value screen — utilities are capital-heavy, rate-regulated, and fail the EV/EBIT and debt filters by design. The tool initially returned nothing for DUK. Fix: added a fallback that queries the full `metrics.csv` (all 186K rows) when a ticker isn't in the portfolio, so any public company is accessible.

**Ticker detection was too aggressive.**
`get_context()` was calling `query.upper().split()` and testing every word against the ticker database. Queries like "what is the **cash** flow" matched `CASH` (a real ticker). "show me **top** 10 stocks" matched `TOP`. "what **ARE** the most undervalued" matched `ARE` (Alexandria Real Estate Equities — also a real ticker). Every common English word that happened to be 2-5 letters was getting looked up.

Fix: only detect tickers if the word is already uppercase in the original query (user deliberately typed `DUK`) or appears as a possessive (`DUK's`). Added a `_NOT_TICKERS` blocklist for English function words that match the pattern: `ARE`, `TOP`, `MOST`, `WILL`, `HAVE`, `WHAT`, `THEY`, etc.

**`run_all.py` failed with `ModuleNotFoundError: No module named 'universe_fixed'`.**
The QuantitativeValue pipeline's `run_all.py` imports `universe_fixed`, but that file had been moved to `archive/test_files/` at some point. A compiled `.pyc` still existed in `__pycache__` (evidence it used to work), but the source was gone. Fix: copied `universe_fixed.py` back to `src/`.

**`edgartools` and its dependencies weren't installed.**
The edgar pipeline uses the `edgartools` Python package, which wasn't in any environment. Normally a `pip install` away, but the global Python's `Scripts/` directory had a Windows file-locking issue — pip kept failing with `[WinError 2] .exe -> .exe.deleteme`. Every transitive dependency that included a console script (rich, httpx, markdown-it-py, unidecode...) failed to install.

Fix: created a dedicated `.venv` inside the QuantitativeValue project directory. The venv has its own isolated `Scripts/` folder with no conflicts. `refresh_data()` in edgar_screener.py now detects the QV venv and uses its Python interpreter when launching the pipeline subprocess.

### What was learned
- The tool injection pattern works cleanly: Python fetches real data → formatted as a `[CONTEXT]` block → prepended to the prompt → LLM reasons over grounded facts instead of hallucinating. Same pattern scales to any external data source.
- Ticker detection in natural language is genuinely hard. Even a "require uppercase" heuristic isn't enough — `ARE` is both a common English verb and a real REIT ticker (Alexandria Real Estate). Blocklists of function words are necessary.
- Python subprocess `cwd` is not enough for projects that rely on relative imports — you also need `PYTHONPATH` set to the `src/` directory.
- When `pip install` fails on Windows due to file locks, creating a fresh venv is cleaner than fighting the global environment. The venv gets its own `Scripts/` with no pre-existing lock conflicts.
- Always check `.pyc` files in `__pycache__` when debugging missing modules — they're evidence of what *used to* be there before someone archived it.

### Files created
- `enkidu.py` — main REPL entry point (root of repo)
- `phase2-tool-use/router.py` — routing logic (LOCAL vs CLOUD)
- `phase2-tool-use/tools/system_info.py` — hardware context tool
- `phase2-tool-use/tools/edgar_screener.py` — financial data tool

---

*This log will be updated as each phase progresses.*
