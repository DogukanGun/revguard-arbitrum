# RevGuard Dashboard — Brand

**Direction:** dark "security workstation" — dense, technical, trustworthy. Reads like a monitoring console
for money-moving agents, not a consumer app. Restraint over decoration; color carries meaning (state), not flair.

## Palette (CSS vars in `app/globals.css`)

| Token | Hex | Meaning |
|---|---|---|
| `--color-bg` | `#0a0c12` | app background (near-black slate) |
| `--color-panel` / `--color-panel-2` | `#11151f` / `#161b27` | cards / raised surfaces |
| `--color-border` | `#232b3a` | hairlines, dividers |
| `--color-text` / `--color-muted` / `--color-faint` | `#e6eaf2` / `#8b94a6` / `#5b6477` | text hierarchy |
| `--color-valid` | `#34d399` (emerald) | fresh heartbeat, agent acting, defender, OK |
| `--color-danger` | `#fb7185` (rose) | revoked, blocked, attacker, BLOCKED reason |
| `--color-warn` | `#fbbf24` (amber) | stale / heartbeat aging |
| `--color-brand` | `#22d3ee` (cyan) | the agent, active edges, primary accent |
| `--color-accent` | `#818cf8` (indigo) | secondary accent |

Use as Tailwind utilities: `bg-panel`, `text-muted`, `border-border`, `text-valid`, `text-danger`, etc.

## Type
- **Sans:** Geist (`--font-geist-sans`) for UI copy.
- **Mono:** Geist Mono (`.mono`) for every on-chain value — addresses, hashes, gas, seconds, nonces.

## Voice
Precise, calm, declarative. "Revocation enforced in 12s ≤ 39s bound." No hype, no emoji in product copy
(status icons OK). State words are literal: VALID / FRESH / STALE / REVOKED / BLOCKED.
