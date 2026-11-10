export type PlayerId = string;
export type TeamId = 'team-1' | 'team-2' | 'team-3' | 'team-4';

export type TokenId =
  | 'auto-rickshaw'
  | 'cricket-bat'
  | 'chai-cup'
  | 'bullet-bike'
  | 'royal-tiger'
  | 'peacock'
  | 'kite'
  | 'elephant';

export type BotDifficulty = 'easy' | 'normal' | 'hard';

export type TileGroup =
  | 'brown'
  | 'lightblue'
  | 'pink'
  | 'orange'
  | 'red'
  | 'yellow'
  | 'green'
  | 'darkblue'
  | 'railway'
  | 'utility'
  | 'special';

export type TileType =
  | 'property'
  | 'railway'
  | 'utility'
  | 'tax'
  | 'chance'
  | 'chest'
  | 'corner';

export interface TileDefinition {
  index: number;
  name: string;
  group: TileGroup;
  type: TileType;
  price?: number; // Classic amount (e.g. 60 = ₹60, 1500 = ₹1,500)
  houseCost?: number; // Classic amount (e.g. 50 = ₹50)
  rent?: [number, number, number, number, number, number]; // [base, 1 house, 2, 3, 4, hotel/mall]
  description?: string;
  image?: string; // Landmark photo/artwork URL
  tagline?: string; // Gen-Z vibe tagline
}

export interface TileState {
  ownerId: PlayerId | null;
  houses: number; // 0-4 houses, 5 = Mall/Hotel
  mortgaged: boolean;
}

export interface CardEffect {
  id: number;
  title: string;
  description: string;
  type:
    | 'MOVE_TO'
    | 'MOVE_REL'
    | 'CASH'
    | 'GO_TO_JAIL'
    | 'GET_OUT_OF_JAIL'
    | 'REPAIRS'
    | 'BIRTHDAY'
    | 'NEAREST_RAILWAY'
    | 'NEAREST_UTILITY';
  targetIndex?: number;
  steps?: number;
  amount?: number;
  houseCost?: number;
  hotelCost?: number;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  tokenId: TokenId;
  color: string;
  teamId?: TeamId; // For 2-player team mode
  cash: number; // In thousands (e.g. 1500 = ₹1,500,000)
  position: number; // 0 to 39
  inJail: boolean;
  jailTurns: number;
  jailCardsCount: number;
  bankrupt: boolean;
  bankruptTo?: PlayerId | 'BANK';
  isBot: boolean;
  botDifficulty?: BotDifficulty;
  connected: boolean;
  /** When this (human) player lost their connection; autopilot waits a grace period before playing for them. */
  disconnectedAt?: number;
  /** Round in which this player last proposed a trade (used to stop bots spamming offers). */
  lastTradeRound?: number;
  /** Stopped at Chai Break: sits out their next turn. */
  skipNextTurn?: boolean;
}

export interface PlayerStats {
  rentCollected: number;
  rentPaid: number;
  propertiesBought: number;
  auctionsWon: number;
  jailVisits: number;
  salaryCollected: number;
  tradesMade: number;
  buildingsBuilt: number;
}

export type FestivalId = 'diwali' | 'monsoon' | 'ipl' | 'shaadi' | 'startup' | 'taxraid' | 'bandh' | 'sale';

export interface ActiveFestival {
  id: FestivalId;
  /** Colour set affected (Shaadi Season only) */
  group?: TileGroup;
  startedRound: number;
}

export type GameMode = 'SOLO' | 'TEAMS'; // Teams is 2 players per team

export interface GameSettings {
  // Game settings section
  maxPlayers: number; // How many players can join the game (2 to 8)
  privateRoom: boolean; // Private rooms can be accessed using room URL only
  allowBots: boolean; // Bots will join the game based on availability
  boardMap: string; // Change map tiles, properties and stacks

  // Gameplay rules section
  doubleRentOnSet: boolean; // If a player owns a full property set, the base rent payment will be doubled
  vacationCash: boolean; // If a player lands on Vacation/Chai Break, all collected money from taxes and bank payments will be earned
  auctionOnDecline: boolean; // If someone skips purchasing the property landed on, it will be sold to the highest bidder
  noRentInJail: boolean; // Rent will not be collected when landing on properties whose owners are in prison
  mortgageEnabled: boolean; // Mortgage properties to earn 50% of their cost, but you won't get paid rent when players land on them
  evenBuild: boolean; // Houses and hotels must be built up and sold off evenly within a property set
  startingCash: number; // Adjust how much money players start the game with (e.g. 1500)
  randomizePlayerOrder: boolean; // Randomize player order at the start of the game

  // Additional options
  mode: GameMode; // 'SOLO' or 'TEAMS' (2 players per team)
  doubleSalaryOnGo: boolean; // Double salary on exact GO landing
  turnTimeoutSeconds: number; // Seconds a human has to act before autopilot takes over (0 = off)
  roundLimit: number; // Game ends after this many rounds, richest wins (0 = play until one is left)
  festivalEvents: boolean; // City-wide festival events shake up the rules every few rounds
  chaiBreakRest: boolean; // Landing on Chai Break means sitting out your next turn
}

export type TurnPhase =
  | 'ROLL'
  | 'MOVING'
  | 'LANDED'
  | 'AWAIT_BUY'
  | 'AUCTION'
  | 'DEBT'
  | 'CARD_DRAWN'
  | 'JAIL_DECISION'
  | 'TURN_END';

export interface AuctionState {
  tileIndex: number;
  highestBid: number;
  highestBidderId: PlayerId | null;
  activeBidderIds: PlayerId[];
  currentBidderIndex: number;
  secondsRemaining: number;
}

export interface TradeOffer {
  id: string;
  proposerId: PlayerId;
  targetId: PlayerId;
  offerCash: number;
  offerProperties: number[]; // tile indexes
  offerJailCards: number;
  requestCash: number;
  requestProperties: number[];
  requestJailCards: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
  /** How many times this deal has been countered back and forth (0 = original offer). */
  counterCount?: number;
  /** When this version of the offer was made (epoch ms). */
  createdAt?: number;
}

export interface ChatMessage {
  id: string;
  senderId: PlayerId;
  senderName: string;
  senderColor: string;
  teamId?: TeamId;
  isTeamOnly?: boolean;
  text: string;
  timestamp: number;
}

export interface GameLogEntry {
  id: string;
  timestamp: number;
  type: 'ROLL' | 'MOVE' | 'BUY' | 'RENT' | 'CARD' | 'JAIL' | 'AUCTION' | 'TRADE' | 'BANKRUPT' | 'SYSTEM';
  message: string;
  playerId?: PlayerId;
  tileIndex?: number;
}

export interface GameState {
  roomCode: string;
  isHost: boolean;
  phase: 'LOBBY' | 'PLAYING' | 'GAME_OVER';
  settings: GameSettings;
  players: Record<PlayerId, PlayerState>;
  playerOrder: PlayerId[];
  currentPlayerIndex: number;
  tiles: Record<number, TileState>;
  dice: [number, number];
  consecutiveDoubles: number;
  turnPhase: TurnPhase;
  vacationPool: number;
  activeCard: { card: CardEffect; deck: 'kismat' | 'khazana' } | null;
  activeAuction: AuctionState | null;
  /** Open trade offers. Everyone can see them; only the two players involved can act on one. */
  trades: TradeOffer[];
  debtAmount: number;
  debtCreditorId: PlayerId | 'BANK' | null;
  /** Tile to land on once the current debt is settled (e.g. jail fine paid on the 3rd failed roll). */
  pendingLanding: number | null;
  winnerPlayerId: PlayerId | null;
  winnerTeamId: TeamId | null;
  logs: GameLogEntry[];
  messages: ChatMessage[];
  remainingHouses: number; // 32 max
  remainingHotels: number; // 12 max
  /** 1-based round counter; a round ends when play passes back to the first seat. */
  round: number;
  activeFestival: ActiveFestival | null;
  stats: Record<PlayerId, PlayerStats>;
  /** Net worth of each player at the start of every round (for the end-of-game chart). */
  history: { round: number; worth: Record<PlayerId, number> }[];
  /** Remaining card order for each deck (indexes into the card lists); reshuffled when empty. */
  decks: { kismat: number[]; khazana: number[] };
  /** When the current decision started (epoch ms) — drives the turn timer. */
  phaseStartedAt: number;
  endReason: 'BANKRUPTCY' | 'ROUND_LIMIT' | null;
  /** Increments on every dice roll so clients can animate repeat results. */
  rollCount: number;
}

export interface PlayerProfile {
  id: PlayerId;
  name: string;
  tokenId: TokenId;
  color: string;
  teamId?: TeamId;
}

export type GameAction =
  | { type: 'START_GAME' }
  | { type: 'ROLL_DICE' }
  | { type: 'LAND_ON_TILE'; tileIndex: number }
  | { type: 'BUY_PROPERTY'; tileIndex: number }
  | { type: 'DECLINE_PROPERTY'; tileIndex: number }
  | { type: 'AUCTION_BID'; playerId: PlayerId; amount: number }
  | { type: 'AUCTION_PASS'; playerId: PlayerId }
  | { type: 'AUCTION_TICK' }
  | { type: 'DISMISS_CARD' }
  | { type: 'PAY_JAIL_FINE'; playerId: PlayerId }
  | { type: 'USE_JAIL_CARD'; playerId: PlayerId }
  | { type: 'BUILD_HOUSE'; playerId: PlayerId; tileIndex: number }
  | { type: 'SELL_HOUSE'; playerId: PlayerId; tileIndex: number }
  | { type: 'MORTGAGE_PROPERTY'; playerId: PlayerId; tileIndex: number }
  | { type: 'UNMORTGAGE_PROPERTY'; playerId: PlayerId; tileIndex: number }
  | { type: 'PROPOSE_TRADE'; offer: Omit<TradeOffer, 'id' | 'status'> }
  | { type: 'ACCEPT_TRADE'; tradeId: string }
  | { type: 'REJECT_TRADE'; tradeId: string }
  | { type: 'COUNTER_TRADE'; tradeId: string; offer: Omit<TradeOffer, 'id' | 'status' | 'counterCount' | 'createdAt'> }
  | { type: 'CANCEL_TRADE'; tradeId: string }
  | { type: 'RESOLVE_DEBT'; playerId: PlayerId }
  | { type: 'DECLARE_BANKRUPTCY'; playerId: PlayerId }
  | { type: 'END_TURN'; force?: boolean }
  | { type: 'SEND_CHAT'; message: Omit<ChatMessage, 'id' | 'timestamp'> }
  | { type: 'ADD_BOT'; difficulty: BotDifficulty; teamId?: TeamId }
  | { type: 'ADD_PLAYER'; profile: PlayerProfile }
  | { type: 'UPDATE_PLAYER'; profile: PlayerProfile }
  | { type: 'SET_PLAYER_CONNECTED'; playerId: PlayerId; connected: boolean }
  /** Host only: stop waiting for a disconnected player and let autopilot take their turns now. */
  | { type: 'SKIP_RECONNECT_WAIT'; playerId: PlayerId }
  | { type: 'REMOVE_PLAYER'; playerId: PlayerId }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<GameSettings> }
  | { type: 'SET_PLAYER_TEAM'; playerId: PlayerId; teamId?: TeamId }
  | { type: 'SET_ROOM'; roomCode: string; isHost: boolean }
  | { type: 'SYNC_STATE'; state: GameState }
  | { type: 'RESET_GAME' };
