# Shipping Bilingual Reading Mode

Markdown editors are great for drafting, but long English docs are still tiring to read when you think in Chinese.

## Why translation belongs in the preview

The goal is not to replace the source file.

You keep the original Markdown intact, and only the preview shows a bilingual layout:

- English remains the source of truth
- Chinese appears under each paragraph for fast scanning
- Code blocks, Mermaid diagrams, and inline code stay untouched

## Design principles

### 1. One click, full document

Reading mode should feel like a switch, not a wizard.

If the API key is already configured, clicking **Translate** should start immediately.

### 2. Paragraph-level fidelity

Translate whole blocks instead of isolated sentences whenever possible.

This preserves technical tone, product names, and list structure.

### 3. Fail honestly

If the network fails, show a clear error.

Never invent a fake permission denial when the real problem is a stale extension build.

## MiniMax Token Plan notes

For this project we prefer the Anthropic-compatible path:

```text
POST https://api.minimaxi.com/anthropic/v1/messages
Header: x-api-key: sk-cp-...
Header: anthropic-version: 2023-06-01
```

Recommended models for speed:

| Model | Use case |
| --- | --- |
| MiniMax-M2.5-highspeed | Default for translation |
| MiniMax-M2.5 | Cheaper fallback |
| MiniMax-M3 | Stronger, may need thinking disabled |

## Acceptance checklist

1. Open this English file in the editor
2. Confirm the toolbar shows **v1.4.2**
3. Configure MiniMax Token Plan · Anthropic with your `sk-cp-` key
4. Click the translate button once
5. Expect Chinese lines under each English paragraph within a few seconds

## Closing thought

A good reading translator disappears into the workflow.

You should notice the meaning first, and the machinery second.
