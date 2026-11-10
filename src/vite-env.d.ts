/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional TURN relay for players who can't connect directly, e.g. "turn:turn.example.com:3478" (comma-separated for several). */
  readonly VITE_TURN_URL?: string;
  readonly VITE_TURN_USERNAME?: string;
  readonly VITE_TURN_CREDENTIAL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
