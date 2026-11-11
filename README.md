# Bazaar

An Indian-themed property-trading board game that runs entirely in the browser. Play against bots on one device, or create a room and share the link with friends anywhere (no sign-up).

**Play it:** [monopoly-cyan.vercel.app](https://monopoly-cyan.vercel.app) · Made by [Alok Kushwaha](https://github.com/Alok-Fusion)

## Features

- **3D cover page** — a dark "Diwali night in the bazaar" welcome screen: strings of fairy lights, floating diyas with flickering flames, drifting gold dust and coins, and a gold *Bazaar* title over a tilting 3D board with tumbling dice and tokens lapping its edge. Entering plays a soft temple-bell chime. It doubles as the loading screen while photos and fonts are fetched; built with CSS 3D, so it's instant and light on phones, and still for people who prefer reduced motion.
- **40-tile Indian board** — cities from Old Delhi to Malabar Hill, four railway stations, Tata Power and Jal Board, Kismat and Khazana cards, and the Shuru, Tihar Jail, Chai Break and Police Custody corners.
- **Full rules** — buying, auctions for skipped properties, rent with full-set bonus, houses and hotels with even building and a limited bank supply, mortgages, debt settlement and bankruptcy.
- **Tihar Jail** — get out right away by paying the ₹50 fine, using a Get Out of Jail Free card, or rolling doubles. Otherwise you sit out one round and then walk out free.
- **Chai Break** — collect the pool, then sit down for chai and miss your next turn (the host can switch this off).
- **Landmark photos** — every property, station and utility tile shows a real photo of the place (free-to-use photos from Unsplash).
- **Open trade board** — trade cash, properties and Get Out of Jail Free cards. Offers go on a public board that every player can see, and they never interrupt play: the receiver can accept, decline or send a **counter-offer** whenever they like, even several turns later. Several deals can be open at once (one per pair of players, up to 3 offers each). If a property in an open offer changes hands, that offer is cancelled automatically. Bots haggle too — lowball them and they'll name their price.
- **Teams of two** — partners pay no rent to each other, share colour sets and inherit each other's assets.
- **Bots** — easy, normal and tough. If a player drops out mid-game, the game waits 60 seconds for them to come back before autopilot plays their turns (the host can tap **Play for them** to skip the wait).
- **Online rooms** — a small game server (WebSockets, hosted on Render) runs each room, so friends can join from any city or network, and the game keeps going if anyone refreshes or leaves. Every player in a room has their own name and colour.
- **Voice chat** — join the call from the lobby or during the game. Mute yourself (or press **M**), mute one person just for you, and see who's talking. Your mic stays off until you join.
- **Game length** — Quick (20 rounds), Standard (30), Long (45) or Endless. With a limit, the richest player (cash + property value) wins when time runs out, so games always finish.
- **Festivals** — every third round a festival bends one rule for that round: Diwali Dhamaka (half-price houses), Monsoon Season (double utility rent), IPL Fever (double railway rent), Shaadi Season (double rent on one colour set), Startup Boom (double salary), Income Tax Raid (double tax), Bharat Bandh (no rent anywhere) and the Great Indian Sale (25% off unowned property). The board announces how many rounds until the next one.
- **Bots that make deals** — when a bot is one property away from a full set, it offers to buy the missing piece (tough bots pay more and drive a harder bargain when selling).
- **Turn timer** — optional 20–90 second clock. If a player lets it run out, a safe default move is made for them (skip buying, end turn, decline a trade); debts get double time.
- **Save & resume** — local games are saved in the browser automatically; reopen the page and pick up where you left off.
- **End-of-game awards** — final ranking, a net-worth-over-time chart, and awards like Landlord of the Year, Master Builder, Deal Maker and Tihar Regular.
- **Live feedback** — cash changes pop up next to each player, and clicking any owned tile shows what you'd pay if you landed there right now.
- **Host-controlled rules** — the host sets every rule right in the lobby (guests see them read-only), or picks a preset: Bazaar, Quick, Classic or Cutthroat. Options: starting cash, max players, game length, turn timer, festivals, Chai Break pool, double rent on sets, auctions, mortgages, even build, no rent from jail, double salary on Shuru, random turn order.
- **Start any time** — the host can start whenever they like: playing alone adds a bot opponent, and Teams mode balances unassigned players automatically.
- **Mortgages where you need them** — tap any property you own to build, sell, mortgage or pay it off. Land on something you can't quite afford and you can mortgage on the spot to buy it.
- **3D dice** — real tumbling cubes (red 1 and 4 like traditional dice) that land on the rolled face; tap the dice to roll. Pure CSS 3D, so they're light on phones and respect reduced-motion settings.
- **Works on every screen** — three columns on desktop, board plus sidebar on laptops and tablets in landscape, and a full-width board with a thumb-friendly action bar on phones.

## Run locally

```bash
npm install
npm run dev      # http://localhost:3000
```

```bash
npm run build    # type-check + production build into dist/
npm run preview
```

## Online play

Online rooms run on a small game server. Every player connects out to it over a WebSocket, so it works across cities, mobile data and office Wi-Fi. The server holds the game, checks every move, and runs the bots, auction clock and turn timer, so the room carries on even if the host refreshes or closes their tab. After 20 seconds without the host, the next player gets the host controls.

**Playing locally (two terminals)**

```bash
npm run dev           # the game, http://localhost:3000
```

```bash
npm run dev:server    # the game server, ws://localhost:8787
```

Friends on the same Wi-Fi can use the invite link straight away: it uses your computer's network address.

**Putting the game server online (free, one time)**

The frontend stays on Vercel; the game server goes on [Render](https://render.com) (free plan).

1. Push this repository to GitHub (Render deploys from it).
2. Create a free Render account, then **New** → **Web Service**, and pick this repository and branch.
3. Fill in:
   - **Root Directory:** `server`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
   - **Environment variable:** `ALLOWED_ORIGINS` = your site, e.g. `https://monopoly-cyan.vercel.app`

   Or choose **New** → **Blueprint**: [`render.yaml`](render.yaml) fills all of this in.
4. When it's live, copy its address (like `https://bazaar-server.onrender.com`). Opening it should say "Bazaar game server is running".
5. In Vercel, open your project → **Settings** → **Environment Variables**, add `VITE_GAME_SERVER_URL` with that address, and redeploy.

Things to know about Render's free plan:

- After 15 minutes with nobody playing, the server sleeps. The next person to create or join a room waits about a minute while it wakes up; the game shows "Starting the game server" and keeps trying for 90 seconds.
- While anyone is playing, the server stays awake.
- If the server restarts or you redeploy, games in progress are lost (the free plan has no saved storage). Redeploy between games.
- 750 free hours a month, enough to keep one server running all month.

**Keeping the server awake all the time (optional)**

The site already pings the server whenever someone has it open. To keep it awake even when nobody does, [`.github/workflows/keep-server-awake.yml`](.github/workflows/keep-server-awake.yml) pings it every 5 minutes from GitHub:

1. Make the repository public (GitHub Actions minutes are free and unlimited for public repositories).
2. In GitHub, open **Settings** → **Secrets and variables** → **Actions** → **Variables** and add `GAME_SERVER_URL` with your Render address.
3. Merge the workflow into `main` (GitHub only runs schedules from the default branch). To test it, open the **Actions** tab → **Keep game server awake** → **Run workflow**.

This uses about 744 of Render's 750 free hours a month. GitHub may delay scheduled runs when it's busy, and it pauses them after 60 days without commits; re-enable from the Actions tab.

**Voice chat** sends audio directly between players, not through the game server. It needs the game on an `https://` address, and players on different networks usually need a TURN relay:

1. Create a free account at [Metered](https://dashboard.metered.ca/signup?tool=turnserver) (20 GB of relay traffic a month).
2. Copy your credentials address, like `https://yourapp.metered.live/api/v1/turn/credentials?apiKey=YOUR_KEY`.
3. In Vercel, add `TURN_CREDENTIALS_URL` with that address and redeploy. Check it at `https://your-site/api/turn`.

The key stays on the server in [`api/turn.js`](api/turn.js). On other hosts, set `VITE_TURN_URL`, `VITE_TURN_USERNAME` and `VITE_TURN_CREDENTIAL` when building instead.

**Staying connected**

- Players reconnect on their own after a Wi-Fi blip or when they come back to a phone that was locked; a yellow bar shows while it happens. If it can't get back within a few minutes, a **Try again** button appears.
- A player can always get their seat back: refresh the page, open the invite link in a new tab, or join from another device with the same name.
- Anyone who drops out shows as **📶 Reconnecting…**, and the game waits 60 seconds on their turn before autopilot (**🤖 Autopilot**) takes over. The host can skip the wait with **Play for them**.
- The join box accepts either the room code or a whole pasted invite link.

## Project layout

- `src/engine/` — game rules: `state.ts` (reducer), `rules.ts` (shared validity checks), `rent.ts`, `bots.ts`, `board.ts`, `cards.ts`. The game server runs the same code.
- `src/net/socket.ts` — the game's connection to the server; `protocol.ts` — the messages both sides send; `voice.ts` — voice chat
- `server/` — the game server: `room.ts` (one room: seats, moves, bots, timers), `node.ts` (the Node.js WebSocket server that runs on Render)
- `src/components/` — board, lobby, sidebars and dialogs

## Safety, privacy and security

- **Policies:** [Privacy](public/privacy.html), [Terms](public/terms.html) and [Safety](public/safety.html), served at `/privacy`, `/terms` and `/safety`, and linked from the cover page and lobby. Online play is for ages 13+ (under 18 with a parent's permission).
- **Data:** no accounts, cookies, ads or analytics. Rooms live only in the game server's memory and are deleted after everyone leaves.
- **Player safety:** chat hides links, emails, phone numbers and @handles, filters swear words (English and Hindi), reminds players not to share personal details, and has tap-a-name muting that also silences that player's voice. Players the host removes can't rejoin that room.
- **Server checks:** every move is checked on the server, and seats are protected by a secret key so nobody can take over another player. Team chat only goes to the team. Messages, chat, connections and rooms are rate-limited, room codes are 7 random characters, and errors in one room can't crash the server.
- **Website headers:** [`vercel.json`](vercel.json) sends a strict Content Security Policy (no inline code, Trusted Types) and other security headers. Fonts are self-hosted. If the game server's address changes, update `connect-src` there too.
- **Supply chain:** Dependabot ([`.github/dependabot.yml`](.github/dependabot.yml)) opens update pull requests, and [`security.yml`](.github/workflows/security.yml) runs CodeQL and `npm audit` on every push.
- **Reporting:** see [SECURITY.md](SECURITY.md) and [`/.well-known/security.txt`](public/.well-known/security.txt).

## Credits

Made by **[Alok Kushwaha](https://github.com/Alok-Fusion)**. Landmark photos are from [Unsplash](https://unsplash.com).

## License

[MIT](LICENSE) © 2026 Alok Kushwaha. You're free to use, change and share this code, as long as you keep the copyright notice and license with it.
