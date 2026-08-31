# ModelForge agent and adaptive tutor setup

Open **Settings → AI agent** or press the robot button in the top toolbar. The AI helper is separate from person-to-person Friends chat.

## Local model

1. Start Ollama with browser access enabled:

   ```sh
   OLLAMA_ORIGINS=http://localhost:8765 ollama serve
   ```

2. Pull a tool-capable model, for example `ollama pull qwen3:8b`.
3. Choose **Local model (Ollama)**, use `http://localhost:11434`, enter the model name, and press **Test connection**.

LM Studio and LocalAI work through **Custom OpenAI-compatible** when their server permits browser CORS.

## Server-managed external model

Keep the upstream credential and endpoint on the relay host. Use a separate access token for browsers that may call the paid model:

```sh
HOME3D_AGENT_BASE_URL=https://api.openai.com/v1 \
HOME3D_AGENT_MODEL=gpt-5-mini \
HOME3D_AGENT_API_KEY=your-upstream-key \
HOME3D_AGENT_ACCESS_TOKEN=choose-a-browser-access-token \
npm start
```

Choose **Server-managed model** and put `HOME3D_AGENT_ACCESS_TOKEN` in the session key field. That token and custom-provider API keys live only in page memory and disappear on reload. Without an access token, the server-managed provider accepts only clients connecting from the relay machine. The relay uses a fixed model and endpoint, filters model-visible tools, rate-limits requests, caps request/response sizes, and never accepts a destination URL from the browser.

## Connect Codex, Claude, or another MCP client

ModelForge includes a standard stdio MCP adapter. It relays live read and preview calls to the open browser; it never exposes an execute tool. A proposed change appears in the AI dock and must be confirmed there.

1. Start the app with a bridge token:

   ```sh
   HOME3D_AGENT_BRIDGE_TOKEN=choose-a-bridge-token npm start
   ```

2. In **Settings → AI agent**, enter the same value under **External MCP bridge token**, enable the external bridge checkbox, and save.
3. Configure the external MCP client to run:

   ```sh
   env HOME3D_AGENT_BRIDGE_TOKEN=choose-a-bridge-token \
     HOME3D_MCP_BRIDGE_URL=http://127.0.0.1:8765 \
     node /absolute/path/to/3dhome/server/agent_mcp.mjs
   ```

The adapter exposes project summary, detailed context, object queries, capability search, history summary/object history/history comparison, catalog search, command listing, and non-mutating command preview.

## Context, tutoring, and privacy

The compact always-on context includes workspace role, locale/units, active tool, selection, view/draft state, counts, warnings, tutorial progress, context budgets, local friction signals, and skill mastery. The model can request bounded details through read-only tools. Entity and history responses disclose total/returned counts instead of silently truncating.

Attention tracking stays in the browser and stores categories such as repeated opening misses, draft cancellations, undo loops, constraint warnings, and coarse pointer-search score—not pointer trails or prompt text. Proactive help can be disabled. Mastery is inferred from project evidence, updated from outcomes, and decays slowly with disuse. Expand **Context inspector** in the AI dock to see exactly what the tutor sees.

Conversation persistence is off by default. If enabled, only user/assistant chat messages are retained on this device. Proposal accept/reject outcomes are retained locally as a bounded feedback log.

## Safety model

Full relevant app context is enabled by default for the connected model: project entities and custom item data, floors and room metadata, active tool and selection, capability registry, history tree, tutorial/mastery progress, and recent in-app attention signals. API keys, bridge tokens, and unrelated browser or device data are never included in model context. Disable **Automatically send full relevant app context** in Settings → AI agent if a compact tool-driven context is preferred.

- Model and external MCP tools can read or preview; they cannot execute.
- The public `window.ModelForgeAgent` bridge exposes context, command metadata, and preview only.
- Confirmed operations run through the transaction layer, re-prepare normalized parameters, reject stale/changed previews, and respect viewer permissions.
- A visual ghost is disposed on reject, cancellation, or execution.
- Experimental WebMCP hosts are feature-detected on `document`, `navigator`, or `window`; read tools carry `readOnlyHint` annotations.

## Synthetic tutor data and evaluation

Generate 1,000 privacy-safe synthetic instruction examples:

```sh
npm run dataset:tutor
```

The output is `dataset/modelforge_tutor_sft.jsonl`. It covers opening prerequisites, wall-draft cancellation, undo/retry, room topology gaps, constraints, and catalog clarification. It contains no user telemetry. Run the deterministic policy evaluation with:

```sh
npm run eval:tutor
```
