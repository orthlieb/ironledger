/**
 * @ironledger/shared
 *
 * TypeScript types shared between the API and the web frontend.
 * Both apps import from here — no duplication, no drift.
 *
 * Rule: this package must have ZERO runtime dependencies.
 * It contains only type definitions, never executable logic.
 */

// ---------------------------------------------------------------------------
export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string; // UUID
  email: string;
  role: string; // 'user' | 'admin'
}

// ---------------------------------------------------------------------------
// Character
// ---------------------------------------------------------------------------

/** Summary returned by GET /characters — no data blob */
export interface CharacterSummary {
  id: string;
  name: string;
  createdAt: string; // ISO 8601
  updatedAt: string;
}

/** Full character returned by GET /characters/:id — includes data blob */
export interface CharacterFull extends CharacterSummary {
  data: CharacterData;
}

/**
 * The character data blob stored in the DB as JSONB.
 * Mirrors the object structure used by the existing ironledger.html localStorage format.
 * Kept as a loose Record to allow the game format to evolve without schema changes.
 */
export type CharacterData = Record<string, unknown>;

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export interface HistoryEntry {
  id: string;
  entryHtml: string;
  occurredAt: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Catalogue (static game data)
// ---------------------------------------------------------------------------

/** Asset definition — mirrors the JSON structure in assets_*.json */
export interface AssetDefinition {
  id: string;
  name: string;
  category: 'Combat Talent' | 'Companion' | 'Path' | 'Ritual' | 'Touched';
  summary?: string;
  preamble?: string;
  postamble?: string;
  abilities: AssetAbility[];
  preconditions?: AssetPrecondition[];
  touchedFeatures?: boolean;
  /** Max number of pips in the counter/health tracker. Renders a pip row in the asset card. */
  counterMax?: number;
  /** Label shown next to the pip row — e.g. "Health", "Doses", "Charges". */
  counterLabel?: string;
  /** CSS colour for filled counter pips — e.g. "#8aab20" for poison green. */
  counterColor?: string;
  /** Canonical icon name for the header badge — maps to an SVG in the icon set.
   *  e.g. "heart", "skull-and-crossbones", "sword", "shield", "eye", "moon". */
  counterIcon?: string;
  /** If present, renders one labelled text input per entry (e.g. ["Companion Name"] or ["God's Name", "Stat"]). */
  nameLabels?: string[];
  /** If present, renders mutually-exclusive radio buttons side by side (e.g. Ironclad armor choice). */
  radioLabels?: string[];
  [key: string]: unknown; // allow future fields without breaking the type
}

export interface AssetAbility {
  enabled: boolean;
  text: string;
  name?: string;
}

export interface AssetPrecondition {
  key: string;
  eq?: number;
  min?: number;
  max?: number;
  ne?: number;
}

/**
 * Catalogue source / expansion tag — an extension id. Historically the fixed
 * union `'base' | 'delve' | 'yrt'`; now any extension id (see the extensions
 * registry) so new expansions need no type change. `'base'` = core content.
 */
export type CatalogueSource = string;

/** Public metadata for one registered extension (served at /catalogue/extensions). */
export interface ExtensionInfo {
  id: string;
  name: string;
  description: string;
  defaultEnabled: boolean;
  order: number;
}

/** Move definition — mirrors the JSON structure in moves/*.json */
export interface MoveDefinition {
  id: string;
  name: string;
  category: string;
  source?: CatalogueSource;
  triggerShort: string;
  trigger: string;
  stats?: MoveStat[];
  strong?: string;
  weak?: string;
  miss?: string;
  notes?: string;
  progressTrack?: string;
  progressSource?: string;
  spellRoll?: boolean;
  /**
   * When true, a roll of this move is downgraded one hit level (strong→weak,
   * weak→miss) if the character does NOT have initiative (`initiative !== 1`).
   * The downgraded result is what lands in the log. Used by the Lodestar
   * flexible End the Fight: you may roll it without initiative, at greater risk.
   */
  initiativeDowngrade?: boolean;
  preconditions?: AssetPrecondition[];
  /**
   * Optional log entry title template. Supports placeholders:
   *   {character}   active character's name
   *   {stat}        stat used in the roll (capitalised)
   *   {expedition}  active expedition/site/journey name
   *   {foe}         active foe name
   *   {move}        move's literal name from the data file
   *
   * When absent the renderer falls back to:
   *   "{character} — {move name} ({stat})"   for action / spell / table rolls
   *   "{character} — {move name}"            for progress and no-roll moves
   */
  logTitle?: string;
  [key: string]: unknown;
}

/**
 * One d100 row of a resolver roll-table: an inclusive range that resolves to
 * a catalogue entity by id (a foe id for `kind: 'foe'`, an asset id for
 * `kind: 'asset'`), with optional prelude/flavor text and an asset category.
 */
export interface RollTableEntry {
  /** Inclusive low bound on d100 (1–100). */
  low: number;
  /** Inclusive high bound on d100 (1–100). */
  high: number;
  /** Catalogue entity id this range resolves to (foe id or asset id). */
  ref: string;
  /** Asset category (Path / Combat Talent / Companion / Ritual). Foes omit it. */
  category?: string;
  /** Optional prelude/flavor narrative shown alongside the resolved entity. */
  text?: string;
}

/**
 * A "resolver oracle" — roll a d100, resolve the matching range to a catalogue
 * foe or asset, and open that entity's existing detail + add-to-character UI.
 * Provided by extensions under `roll-tables/*.json`; gated by `source`.
 */
export interface RollTable {
  /** Stable camelCase key (e.g. `lodestarEncounterIndex`). */
  id: string;
  /** Display name. */
  name: string;
  /** What the entries resolve to. */
  kind: 'foe' | 'asset';
  /** Owning extension id — hidden unless that expansion is enabled. */
  source: string;
  /** Optional intro/preface shown above the table in its roll dialog.
   *  Paragraphs separated by blank lines (`\n\n`). */
  description?: string;
  /** d100 ranges → entity refs, ascending and non-overlapping. */
  entries: RollTableEntry[];
}

export interface MoveStat {
  stat: string;
  desc: string;
}

/**
 * Foe override — lets an expansion reshape the base foe catalogue:
 *   present:  false hides the foe from pickers while that expansion is active
 *   addendum: appended to the foe's description when that expansion is active
 *
 * Stored per-expansion in apps/api/data/foes/foes_overrides_<source>.json.
 * The override's `source` is the expansion that owns the override, not the
 * foe's original source.
 */
export interface FoeOverride {
  present?: boolean;
  addendum?: string;
}

/** One expansion's foe overrides — keyed by foe id. */
export interface FoeOverridesFile {
  source: CatalogueSource;
  overrides: Record<string, FoeOverride>;
}

export interface OracleEntry {
  topRange: number;
  value: string | Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

/** Status of a single admin invitation as seen by the admin UI. */
export type InviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface AdminInvite {
  id: string;
  email: string;
  displayName: string | null;
  role: string; // always 'user' for now — admin invites disallowed
  invitedBy: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  acceptedUserId: string | null;
  revokedAt: string | null;
  createdAt: string;
  status: InviteStatus; // derived server-side
}

/** Admin response after POST /admin/invites — includes the one-time raw URL. */
export interface CreateInviteResult {
  invite: AdminInvite;
  url: string; // always returned so admin can copy if mail fails
}

/** Public view of an invite, returned by GET /invites/:token. */
export interface InvitePreview {
  email: string;
  displayName: string | null;
  expiresAt: string;
}

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  characterCount: number;
  encounterCount: number;
  expeditionCount: number;
}

export interface AdminStats {
  totalUsers: number;
  activeUsers7d: number;
  activeUsers30d: number;
  totalCharacters: number;
  totalEncounters: number;
  totalExpeditions: number;
  currentlyLoggedIn: number;
}

export interface TimeseriesBucket {
  label: string;
  timestamp: string;
  newUsers: number;
  activeUsers: number;
  totalUsers: number;
}

export interface UserTimeseries {
  timeframe: string;
  buckets: TimeseriesBucket[];
}

export interface AuditEvent {
  id: string;
  adminId: string | null;
  adminEmail: string | null;
  eventType: string;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

export interface MaintenanceStatus {
  enabled: boolean;
  message: string | null;
  shutdownAt: string | null;
}

// Registration lock
// ---------------------------------------------------------------------------

export interface RegistrationLockStatus {
  locked: boolean;
  message: string | null;
}

// Broadcast banner
// ---------------------------------------------------------------------------

export type BroadcastSeverity = 'info' | 'warning';

export interface BroadcastStatus {
  active: boolean;
  message: string | null;
  severity: BroadcastSeverity;
  postedAt: string | null; // ISO timestamp — dismissal key
}

// Combined public status — polled by the app shell on an interval.
export interface SystemStatus {
  maintenance: MaintenanceStatus;
  broadcast: BroadcastStatus;
}
