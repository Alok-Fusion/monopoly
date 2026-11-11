/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The Bazaar game server, e.g. "wss://bazaar-server.yourname.workers.dev" (see README). */
  readonly VITE_GAME_SERVER_URL?: string;
  /** Optional TURN relay for players who can't connect directly, e.g. "turn:turn.example.com:3478" (comma-separated for several). */
  readonly VITE_TURN_URL?: string;
  readonly VITE_TURN_USERNAME?: string;
  readonly VITE_TURN_CREDENTIAL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
