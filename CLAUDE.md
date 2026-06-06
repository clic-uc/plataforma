# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Production build
npm run lint     # Run ESLint
```

There is no test suite configured yet.

## Stack

- **Next.js 16** with App Router (`src/app/`)
- **React 19** with React Compiler enabled (`reactCompiler: true` in `next.config.ts`)
- **TypeScript** with strict mode
- **Tailwind CSS v4** (PostCSS plugin via `@tailwindcss/postcss`)
- **Geist** font family (sans + mono), loaded via `next/font/google`

## Path alias

`@/*` maps to `src/*` — use `@/components/...`, `@/lib/...`, etc.

## Architecture

App Router conventions apply: layouts in `layout.tsx`, pages in `page.tsx`, server components by default. The root layout (`src/app/layout.tsx`) sets up fonts and a full-height flex column body.

React Compiler is active, so manual `useMemo`/`useCallback` for performance is unnecessary — the compiler handles memoization automatically.
