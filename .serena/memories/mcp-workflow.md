# MCP Servers & Workflow Configuration

## Global MCP Servers (user-level)
1. **Tavily** — HTTP remote, AI search: `https://mcp.tavily.com/mcp/?tavilyApiKey=tvly-dev-...`
2. **Context7** — Fresh library docs: `npx -y @upstash/context7-mcp@latest`
3. **Playwright** — Browser automation: `npx -y @playwright/mcp@latest`
4. **Sequential Thinking** — Structured reasoning: `npx -y @modelcontextprotocol/server-sequential-thinking`
5. **Serena** — Code intelligence, memory (already configured as plugin)

## Project MCP Servers (.mcp.json in D:\GIFTSSITE)
1. **next-devtools-mcp** — Next.js dev tools: `npx -y next-devtools-mcp@latest`
2. **drizzle-mcp** — Drizzle ORM tools: `npx -y drizzle-mcp ./drizzle.config.ts`
3. **tailwindcss-mcp-server** — Tailwind docs: `npx -y tailwindcss-mcp-server`

## When to Use What
- Researching APIs/docs → Context7 first, Tavily for web search
- Working with DB schema → drizzle-mcp
- Debugging Next.js → next-devtools-mcp
- Testing UI → Playwright
- Complex architecture → Sequential Thinking
- Memory/state → Serena (always)

## Newly Added MCP Servers (Feb 19 update)

### Global Level (added to ~/.claude.json)
6. **Neon MCP** — PostgreSQL management: `npx -y mcp-remote https://mcp.neon.tech/sse`
7. **Railway MCP** — Deployment management: `npx -y @railway/mcp-server`

### Project Level (added to .mcp.json)
4. **TanStack MCP** (official) — Table/Query docs: `npx -y @tanstack/cli mcp`
5. **Better Auth MCP** (official) — Auth docs/tools: `npx -y @better-auth/mcp`
6. **Magic MCP** (21st.dev) — UI component generation: `npx -y @21st-dev/magic@latest` (needs API key)

## Notes
- Magic MCP requires API key from 21st.dev — get before using
- Neon MCP will authenticate via browser on first use
- Railway MCP requires `railway login` first
- All servers activate after Claude Code restart