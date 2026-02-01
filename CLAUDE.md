# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
pnpm run build      # Build both CJS and ESM outputs (runs clean first)
pnpm run clean      # Remove lib/ and coverage/ directories
pnpm test           # Run Jest tests
```

## Architecture

This is a TypeScript library that provides a fetch-based alternative to the browser's EventSource API for server-sent events (SSE).

### Core Files

- **src/fetch.ts** - Main entry point. `fetchEventSource()` function handles the request lifecycle, retry logic, visibility change handling (pauses connection when page is hidden), and abort signal management.

- **src/parse.ts** - Streaming parser that converts byte chunks into EventSource messages. Uses a pipeline pattern:
  - `getBytes()` - Reads chunks from a ReadableStream
  - `getLines()` - Parses byte chunks into line buffers, handling \r, \n, and \r\n line endings
  - `getMessages()` - Parses lines into EventSourceMessage objects with id, event, data, and retry fields

- **src/index.ts** - Public API exports: `fetchEventSource`, `FetchEventSourceInit`, `EventStreamContentType`, `EventSourceMessage`

### Key Types

- `FetchEventSourceInit` - Extends RequestInit with callbacks: `onopen`, `onmessage`, `onclose`, `onerror`. Also supports `headers` as a function for dynamic token refresh.
- `EventSourceMessage` - Message shape: `{ id, event, data, retry? }`

### Build Output

Dual-format package:
- CommonJS: `lib/cjs/` (main entry)
- ES Modules: `lib/esm/` (module entry)
