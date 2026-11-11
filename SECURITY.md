# Security policy

## Reporting a problem

Please report security problems **privately**, not in a public issue:

1. Go to the repository's [Security tab](https://github.com/Alok-Fusion/monopoly/security) and choose **Report a vulnerability** (it opens a private advisory only the maintainer can see).
2. Describe what you found, how to reproduce it, and what it lets someone do.

We aim to reply within a week. Please give us a reasonable time to fix the problem before you talk about it publicly. Testing is welcome on your own rooms or a local copy (`npm run dev` plus `npm run dev:server`). Please don't attack other players' games, overload the live servers, or access anyone else's data.

## What's in scope

- The website at https://monopoly-cyan.vercel.app and its `/api/turn` function
- The game server (`server/`, running on Render)
- The game code in this repository

## How the game protects players

- The game server is authoritative: it checks every move against the rules, and players can only act for their own seat.
- Each seat has a random secret key, handed only to the device that holds it, so nobody can take over a seat whose player is connected.
- Names, colours, chat, trades, bids and settings are validated on the server. Chat is length-limited, rate-limited, swear-filtered and has contact details and links removed; team chat goes only to that team.
- Players the host removes are blocked from that room by seat and address.
- The server limits message size and rate, connections per address and in total, and rooms. It forgets made-up room codes straight away, closes connections that never join, and catches errors so one room can't crash the rest. Room codes are 7 characters from a cryptographic random source.
- The website sends a strict Content Security Policy (no inline scripts or styles, Trusted Types) and other security headers (see `vercel.json`), and self-hosts its fonts. The relay key stays server-side in `api/turn.js`, which answers only the game's own pages.
- Dependabot and a CodeQL + `npm audit` workflow watch for vulnerable code and dependencies.
- No accounts, passwords or payment details exist, and rooms live only in memory.

If you change the game server's address, update `connect-src` in `vercel.json` too, or the site won't be able to reach it.
