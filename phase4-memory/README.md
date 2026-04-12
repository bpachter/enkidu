# Phase 4 — Persistent Memory

*Coming after Phase 3 is complete.*

**Goal:** The assistant remembers context across conversations using local vector search.

**Planned:**
- ChromaDB for vector storage
- nomic-embed-text for local embeddings (via Ollama)
- SQLite for structured conversation history
- RAG pipeline: embed query → retrieve relevant past context → prepend to prompt

See [JOURNEY.md](../JOURNEY.md) for updates as this phase progresses.
