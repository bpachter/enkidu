# Phase 1 — Local Inference

Get a 27B parameter LLM running locally on your GPU. By the end of this phase you will be able to chat with Gemma 3 27B in a browser, with no internet connection required and no API costs.

**Time to complete:** 1-2 hours (mostly waiting for downloads)
**Disk space needed:** ~20GB free
**VRAM needed:** 16GB+ (Gemma 3 27B Q4 uses ~16GB)

---

## Prerequisites

- Docker Desktop installed with WSL2 backend ([install guide](https://docs.docker.com/desktop/install/windows-install/))
- NVIDIA GPU drivers up to date (CUDA 12.x)
- Verify Docker is working: `docker run --rm hello-world`

---

## Step 1 — Start Ollama

Ollama manages local LLM downloads and serves them via a local HTTP API.

```bash
docker run -d \
  --gpus all \
  -v ollama:/root/.ollama \
  -p 11434:11434 \
  --name ollama \
  ollama/ollama
```

**What each flag does:**
- `--gpus all` — passes your GPU through to the container (CUDA access)
- `-v ollama:/root/.ollama` — persistent volume so downloaded models survive container restarts
- `-p 11434:11434` — exposes Ollama's API on localhost:11434
- `--name ollama` — names the container so you can reference it easily

Verify it's running:
```bash
docker ps
# Should show the ollama container with status "Up"
```

---

## Step 2 — Pull Gemma 3 27B

This downloads the model weights (~16GB). Go make coffee.

```bash
docker exec ollama ollama pull gemma3:27b
```

To see what models are downloaded:
```bash
docker exec ollama ollama list
```

**Why Gemma 3 27B?**
- Strong reasoning for its size
- Quantized to Q4 (~16GB), fits in a 24GB GPU with room to spare
- Free and open source, good Ollama support

**Smaller option if you have less VRAM:**
```bash
docker exec ollama ollama pull gemma3:12b   # ~8GB VRAM
docker exec ollama ollama pull gemma3:4b    # ~4GB VRAM
```

---

## Step 3 — Test Inference via CLI

```bash
docker exec -it ollama ollama run gemma3:27b "What is CUDA and why does it matter for AI?"
```

You should see a streamed response. Note the time — this is your baseline latency.

---

## Step 4 — Start Open WebUI

Open WebUI gives you a browser-based chat interface connected to your local Ollama instance.

```bash
docker run -d \
  -p 3000:8080 \
  --add-host=host.docker.internal:host-gateway \
  -e OLLAMA_BASE_URL=http://host.docker.internal:11434 \
  -v open-webui:/app/backend/data \
  --name open-webui \
  --restart always \
  ghcr.io/open-webui/open-webui:main
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

On first launch it will ask you to create an admin account — this is local only, no cloud signup required.

---

## Step 5 — Benchmark

Once you can chat with Gemma locally, measure performance:

```bash
python inference_bench.py
```

*(See `inference_bench.py` in this folder — to be built once Ollama is running)*

Record:
- Time to first token (latency)
- Tokens per second (throughput)
- GPU VRAM usage (`nvidia-smi` in a separate terminal)
- Compare the same question to Claude API response time

---

## Troubleshooting

**Container starts but GPU not detected:**
- Ensure NVIDIA drivers are updated (470+ for CUDA 12)
- In Docker Desktop: Settings → Resources → check GPU is enabled
- Try: `docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi`

**Port 11434 already in use:**
- Something else is using the port: `netstat -ano | findstr 11434`
- Or Ollama is already running outside Docker

**Model download stalls:**
- Normal for large files to pause briefly — wait a few minutes
- If stuck: `docker exec ollama ollama pull gemma3:27b` (it will resume)

---

## What You Learned in Phase 1

- How Docker containers work (images, containers, volumes, port mapping)
- How WSL2 enables Linux containers on Windows with GPU passthrough
- How Ollama abstracts model loading and CUDA inference
- What model quantization is (Q4 = 4-bit, trades some quality for ~4x smaller size)
- Practical VRAM constraints for running large models
