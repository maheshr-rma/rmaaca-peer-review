# rmaaca.in — Multi-Model AI Peer Review

A Next.js 16 web app where one prompt is sent to **three GLM-4.6 agents** in
parallel (Analytical, Creative, Practical), each with a distinct persona.
A **peer-reviewer agent** then scores each response 0–100 and synthesizes
the single best final answer.

## Quick start

```bash
# 1. Install dependencies
bun install      # or: npm install / pnpm install

# 2. Create the Z.ai config file (required by z-ai-web-dev-sdk)
#    Place this at ONE of:
#      ./.z-ai-config            (project root — recommended)
#      ~/.z-ai-config            (your home dir)
#      /etc/.z-ai-config         (system-wide)
cat > .z-ai-config <<'EOF'
{
  "baseUrl": "https://api.z.ai/api/paas/v4",
  "apiKey": "YOUR_ZAI_API_KEY"
}
EOF
chmod 600 .z-ai-config

# 3. Run the dev server
bun run dev      # or: npm run dev
#    → open http://localhost:3000

# 4. Build for production
bun run build
NODE_ENV=production node .next/standalone/server.js
```

Get your API key from **https://z.ai** → API Keys.

## Project structure

```
src/
├── app/
│   ├── api/
│   │   ├── agents/route.ts     # SSE: 3 parallel GLM-4.6 streams
│   │   └── review/route.ts     # SSE: score (JSON) + synthesize (stream)
│   ├── globals.css             # Academic navy + gold theme
│   ├── layout.tsx              # Playfair Display + Geist fonts
│   └── page.tsx                # Hero + session view + orchestration
├── components/
│   ├── agent-card.tsx          # Rich streaming agent card
│   ├── markdown.tsx            # Markdown renderer + copy button
│   └── review-panel.tsx        # Peer review scores + synthesis
└── lib/
    ├── agents.ts               # Agent personas + reviewer persona
    ├── sse-parse.ts            # Parse SDK byte stream into SSE events
    └── zai-retry.ts            # Retry w/ exponential backoff for 429s
```

## How it works

1. **`/api/agents`** — Fires 3 GLM-4.6 streaming completions in parallel
   with staggered starts (350ms apart) and exponential-backoff retry.
   Token deltas interleave into a single SSE stream.

2. **`/api/review`** — Two-phase:
   - Phase 1 (non-streaming): reviewer scores each response as JSON.
   - Phase 2 (streaming): reviewer synthesizes one final answer.

3. The SDK returns a raw `ReadableStream<Uint8Array>` when `stream:true`
   — `src/lib/sse-parse.ts` parses it into individual SSE events.

## Tech stack

- Next.js 16 (App Router, standalone output)
- TypeScript 5, Tailwind CSS 4, shadcn/ui
- z-ai-web-dev-sdk (GLM-4.6)
- Playfair Display (serif headings) + Geist (sans body)

## Deploy

See the deployment options in the conversation, or:

- **Vercel**: import repo, add `.z-ai-config` as a project file, deploy
- **Docker**: `docker build -t rmaaca-in . && docker run -p 3000:3000 rmaaca-in`
- **VPS**: `node .next/standalone/server.js` behind Caddy/Nginx

## Branding

- Logo: navy shield with gold "R" monogram (inline SVG in `page.tsx`)
- Palette: navy `#0F2A4A`, gold `#A67828`, cream `#FBF9F4`
- Typography: Playfair Display serif + Geist sans
- Replace `RmaacaMark` in `src/app/page.tsx` with your own SVG if needed
