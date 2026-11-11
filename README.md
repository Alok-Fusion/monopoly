# Bazaar

An Indian-themed property-trading board game that runs entirely in the browser. Play against bots on one device, or create a room and share the link — friends connect peer-to-peer to your browser (no server or sign-up).

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
- **Online rooms** — PeerJS/WebRTC. The host's browser runs the game and validates every action from guests. Every player in a room has their own name and colour.
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

1. Start the game with `npm run dev` and open it.
2. In the lobby click **Create online room**, then **Copy invite** and send the link (or show the QR code).
3. Keep your tab open while you play — the game runs in the host's browser and friends connect directly to it.

**Who can join?**

- **Same Wi-Fi:** when you host from `localhost`, the invite link automatically uses your computer's network address (e.g. `http://192.168.0.109:3000/?room=AB3CD`), so friends on the same Wi-Fi can open it. The first time, Windows may ask to allow Node.js through the firewall — allow it on private networks.
- **Over the internet:** run `npm run build` and upload the `dist/` folder to any static host (Netlify, Vercel, GitHub Pages…). Invite links then use that public address.
- **Phones on mobile data / strict networks:** these block direct connections, so players need a TURN relay. See below.

**Setting up the relay (recommended once the game is online)**

If players see *"one of your networks is blocking direct connections"* (or `ICE failed, add a TURN server` in the browser console), the game needs a relay. On Vercel:

1. Create a free account at [Metered](https://dashboard.metered.ca/signup?tool=turnserver) (free tier: 20 GB of relay traffic a month).
2. Copy your credentials address. It looks like `https://yourapp.metered.live/api/v1/turn/credentials?apiKey=YOUR_KEY`.
3. In Vercel, open your project → **Settings** → **Environment Variables**, and add `TURN_CREDENTIALS_URL` with that address.
4. Redeploy. To check it, open `https://your-site/api/turn`: you should see a list of servers rather than an error.

The key stays on the server, in [`api/turn.js`](api/turn.js). Traffic only uses the relay when a direct connection isn't possible, and it stays encrypted between players. On other hosts, set `VITE_TURN_URL`, `VITE_TURN_USERNAME` and `VITE_TURN_CREDENTIAL` when building instead.

**Voice chat** needs the game to be on an `https://` address (a plain `http://192.168…` link can't use the microphone).

**Staying connected**

- Guests reconnect on their own after a Wi-Fi blip or when they come back to a phone that was locked — a yellow bar shows while it happens. If it can't get back within a few minutes, a **Try again** button appears.
- A player can always get their seat back: refresh the page, open the invite link in a new tab, or — on another device — join with the same name they were playing as.
- The host sees **📶 Reconnecting…** next to anyone who dropped out, and the game waits 60 seconds on their turn before autopilot (**🤖 Autopilot**) takes over. The host can skip the wait with **Play for them**.
- The join box accepts either the room code or a whole pasted invite link.

## Project layout

- `src/engine/` — game rules: `state.ts` (reducer), `rules.ts` (shared validity checks), `rent.ts`, `bots.ts`, `board.ts`, `cards.ts`
- `src/net/peer.ts` — PeerJS host/guest networking
- `src/components/` — board, lobby, sidebars and dialogs
"# monopoly" 
