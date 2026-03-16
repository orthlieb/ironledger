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
// API response envelope
// ---------------------------------------------------------------------------

export interface ApiSuccess<T> {
  data:    T;
  message?: string;
}

export interface ApiError {
  statusCode: number;
  error:      string;
  message:    string;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface AuthUser {
  id:    string;   // UUID
  email: string;
  role:  string;   // 'user' | 'admin'
}

export interface LoginResponse {
  user:        AuthUser;
  accessToken: string;
  // refresh token travels in an HttpOnly cookie — not in this body
}

// ---------------------------------------------------------------------------
// Character
// ---------------------------------------------------------------------------

/** Summary returned by GET /characters — no data blob */
export interface CharacterSummary {
  id:        string;
  name:      string;
  createdAt: string;   // ISO 8601
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
  id:         string;
  entryHtml:  string;
  occurredAt: string;   // ISO 8601
}

// ---------------------------------------------------------------------------
// Catalogue (static game data)
// ---------------------------------------------------------------------------

/** Asset definition — mirrors the JSON structure in assets_*.json */
export interface AssetDefinition {
  id:          string;
  name:        string;
  category:    'Combat Talent' | 'Companion' | 'Path' | 'Ritual' | 'Touched';
  summary?:    string;
  preamble?:   string;
  postamble?:  string;
  abilities:   AssetAbility[];
  preconditions?: AssetPrecondition[];
  companionHealthMax?: number;
  touchedFeatures?:   boolean;
  [key: string]: unknown;   // allow future fields without breaking the type
}

export interface AssetAbility {
  enabled: boolean;
  text:    string;
  name?:   string;
}

export interface AssetPrecondition {
  key:  string;
  eq?:  number;
  min?: number;
  max?: number;
  ne?:  number;
}

/** Move definition — mirrors the JSON structure in moves/*.json */
export interface MoveDefinition {
  id:           string;
  name:         string;
  category:     string;
  triggerShort: string;
  trigger:      string;
  stats?:       MoveStat[];
  strong?:      string;
  weak?:        string;
  miss?:        string;
  notes?:       string;
  preconditions?: AssetPrecondition[];
  [key: string]: unknown;
}

export interface MoveStat {
  stat: string;
  desc: string;
}

/** Oracle table definition */
export interface OracleTable {
  key:         string;
  title:       string;
  group:       string;
  selectLabel: string;
  description?: string;
  data:        OracleEntry[];
}

export interface OracleEntry {
  topRange: number;
  value:    string | Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export interface AdminUser {
  id:              string;
  email:           string;
  role:            string;
  isActive:        boolean;
  createdAt:       string;
  lastLoginAt:     string | null;
  characterCount:  number;
  encounterCount:  number;
  expeditionCount: number;
}

export interface AdminStats {
  totalUsers:       number;
  activeUsers7d:    number;
  activeUsers30d:   number;
  totalCharacters:  number;
  totalEncounters:  number;
  totalExpeditions: number;
}

export interface AuditEvent {
  id:         string;
  adminId:    string | null;
  adminEmail: string | null;
  eventType:  string;
  ipAddress:  string | null;
  metadata:   Record<string, unknown> | null;
  createdAt:  string;
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

export interface MaintenanceStatus {
  enabled:    boolean;
  message:    string | null;
  shutdownAt: string | null;
}
