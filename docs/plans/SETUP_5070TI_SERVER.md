# ModelForge AI Backend Setup Guide for RTX 5070 Ti (Windows 11 / WSL2)

This document contains step-by-step instructions for setting up the high-performance local AI inference server on a PC equipped with an **NVIDIA GeForce RTX 5070 Ti (16 GB VRAM)**.

---

## 🎯 Target Configuration

* **Model:** `Qwen/Qwen3.8-27B-Instruct-AWQ`
* **Inference Engine:** `vLLM` (OpenAI-compatible REST API server)
* **KV Cache Format:** `fp8_e4m3` (NVIDIA Native FP8 Tensor Core acceleration)
* **Context Length:** `16384` tokens
* **VRAM Safety Cap:** `78%` (~12.5 GB max for LLM), permanently reserving **~3.5 GB VRAM** for Windows 11 DWM and browser WebGL 3D rendering.
* **Server Port:** `8000` (exposed on `0.0.0.0` for local network access)

---

## 🛠️ Step 1: Prerequisites Check

Ensure the PC has:
1. **NVIDIA Driver:** Latest Game Ready or Studio Driver (supporting CUDA 12.4+ / Blackwell 50-series).
2. **WSL2 (Recommended for maximum performance) or Native Python 3.10+**:
   * Open PowerShell as Administrator and ensure WSL is installed:
     ```powershell
     wsl --install -d Ubuntu-24.04
     ```

---

## 🚀 Step 2: Environment Installation (inside WSL2 Ubuntu)

Run the following commands in the WSL terminal:

```bash
# 1. Update system packages
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3-pip python3-venv git curl

# 2. Create a dedicated virtual environment for vLLM
python3 -m venv ~/vllm-env
source ~/vllm-env/bin/activate

# 3. Install PyTorch with CUDA 12.4+ and vLLM
pip install --upgrade pip
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
pip install vllm
```

---

## 📦 Step 3: Create the Server Startup Script

Create a script named `start_modelforge_ai.sh` in the home directory:

```bash
cat << 'EOF' > ~/start_modelforge_ai.sh
#!/bin/bash
source ~/vllm-env/bin/activate

echo "======================================================"
echo " Starting ModelForge AI Server on RTX 5070 Ti (16GB)  "
echo " Model: Qwen3.8-27B-Instruct-AWQ                      "
echo " Cache: FP8 (fp8_e4m3) | Max Context: 16384           "
echo " VRAM Reserved for Windows/WebGL: ~3.5 GB             "
echo "======================================================"

python3 -m vllm.entrypoints.openai.api_server \
  --model Qwen/Qwen3.8-27B-Instruct-AWQ \
  --quantization awq \
  --kv-cache-dtype fp8_e4m3 \
  --max-model-len 16384 \
  --gpu-memory-utilization 0.78 \
  --host 0.0.0.0 \
  --port 8000 \
  --dtype auto \
  --enforce-eager
EOF

chmod +x ~/start_modelforge_ai.sh
```

---

## ⚡ Step 4: Run the Server

To launch the server:

```bash
~/start_modelforge_ai.sh
```

* *Note on first run:* vLLM will automatically download the quantized model weights (~11.8 GB) from Hugging Face into `~/.cache/huggingface/`.
* When the server is ready, you will see:
  `INFO: Application startup complete. Uvicorn running on http://0.0.0.0:8000`

---

## 🧪 Step 5: Test the API Endpoint

Open a new terminal (on the PC or from your Mac) and test the endpoint:

```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen/Qwen3.8-27B-Instruct-AWQ",
    "messages": [
      {"role": "system", "content": "You are the ModelForge CAD tutor."},
      {"role": "user", "content": "Hello! Confirm you are running with zero offload on 5070 Ti."}
    ],
    "temperature": 0.2,
    "max_tokens": 100
  }'
```

You should receive an instant JSON response with generated text.

---

## 🌐 Step 6: Connect ModelForge on Mac / Other Devices

1. Find the local IP address of your 5070 Ti PC:
   * In Windows PowerShell, run: `ipconfig` (look for `IPv4 Address`, e.g., `192.168.1.150`).
2. If Windows Firewall prompts you on port 8000, allow access for Private Networks.
3. In ModelForge's client configuration or `.env`:
   ```javascript
   const AI_ENDPOINT = "http://192.168.1.150:8000/v1/chat/completions";
   const AI_MODEL = "Qwen/Qwen3.8-27B-Instruct-AWQ";
   ```

---

## 🪟 Alternative: Windows Native (Without WSL2) via LM Studio

If you prefer a 1-click Windows GUI instead of WSL:
1. Download & install **LM Studio** on Windows 11.
2. Search and download: `Qwen3.8-27B-Instruct-AWQ` (or `IQ4_XS` GGUF).
3. Under **Developer tab / Local Server**:
   * Set Port: `8000`
   * Enable `Serve on Local Network (0.0.0.0)`
   * Set Context Length: `16384`
   * GPU Acceleration: `CUDA` (Max offload)
4. Click **Start Server**.
