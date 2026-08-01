# Communities, NPCs & Places

> **⚠️ v2 note.** The standalone `CommunityCard` / `NpcCard` components were merged into **`apps/web/src/lib/components/v2/CommunitiesArea.svelte`** in the v2 rewrite. The card-component references below are retired v1 names; the data model + behaviour still apply.

The Connections deck holds three distinct kinds of entry, each capturing a different thing:

- **Community** — a **people** anchored to a location: a settlement, city, town, outpost, castle, nomad band. Named for the group, not the ground under their feet. Hobbiton.
- **NPC** — an individual person: named, motivated, sometimes bonded, sometimes dangerous. Bilbo.
- **Place** — a **fixed location** worth remembering, inside a community or somewhere in the surrounding world. An inn, a market stall, a shrine, a ruin, a peak on the horizon. Mt. Doom.

All three are oracle-driven where useful, and free-form everywhere else.

> **Place vs Site**: a Place (a Connection) is a fixed feature you want to remember. A Site is a Delve-mechanic expedition with progress ticks and denizen tables — you delve INTO a Site to explore it. Different concepts, different storage.

---

## Data Model

### Community

```typescript
// apps/web/src/lib/types.ts:357
interface Community {
  id: string; // crypto.randomUUID()
  name: string;
  region: string;
  location: string;
  locationDescription: string;
  trouble: string;
  notes: string; // markdown — long-form Description of the place
  situationalNotes?: string; // markdown — conditions, aspects of the trouble
  portraitEtag?: string; // content hash; bytes live in the portrait blob store
  imageUrl?: string; // @deprecated legacy inline base64 — import transport only
  createdAt?: number; // Date.now() on creation
}
```

### NPC

```typescript
// apps/web/src/lib/types.ts:369
interface Npc {
  id: string;
  name: string;
  role: string;
  goal: string;
  descriptor: string; // short likeness — tall, gaunt, scarred…
  relationship: 'neutral' | 'bond' | 'foe';
  location: string; // free-form, not an FK to Community.id
  notes: string; // markdown — Background: origin, upbringing, major traits
  situationalNotes?: string; // markdown — actions taken by or things that have happened to this NPC in your story
  portraitEtag?: string; // content hash; bytes live in the portrait blob store
  imageUrl?: string; // @deprecated legacy inline base64 — import transport only
  createdAt?: number;
}
```

NPCs are not formally linked to a Community — `Npc.location` is a plain string the player fills in. This keeps data entry quick and avoids cascade-on-delete questions.

#### Field semantics (NPC)

The three free-form text fields each have a specific role; keeping the
distinction makes them useful long-term rather than collapsing into one
catch-all note:

| Field              | What it's for                                                                                               | Where it shows                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `descriptor`       | **Short** physical likeness — `tall, gaunt, scarred`. One line, no markdown.                                | Core tab → Descriptor field                                       |
| `notes`            | **Background** — origin, upbringing, major personality traits. The slow-changing identity of the character. | Core tab → small Background block, full Background tab (markdown) |
| `situationalNotes` | Running record of campaign-relevant actions and events — what the NPC has done, what has happened to them.  | Core tab → Notes block (markdown)                                 |

Communities share the same `notes` + `situationalNotes` split but with the
Description / Trouble framing: `notes` is the long-form description of the
place, `situationalNotes` is conditions and aspects of the current trouble.

### Place

```typescript
// apps/web/src/lib/types.ts
interface Place {
  id: string; // crypto.randomUUID()
  name: string;
  region: string;
  location: string;
  locationDescription: string;
  trouble: string; // freeform — no Settlement Trouble oracle here
  notes: string; // markdown — physical features, atmosphere, notable details
  situationalNotes?: string; // markdown — events that have happened here, current state
  portraitEtag?: string; // content hash; bytes live in the portrait blob store
  imageUrl?: string; // @deprecated legacy inline base64 — import transport only
  createdAt?: number;
}
```

Places share Community's field shape today so the same card renders both. They live in their own entity kind (`user_entities.kind = 'place'`) so future divergence (place-specific fields like `parentCommunityId`, `terrain`, etc.) doesn't require a schema shuffle. The Settlement Trouble oracle is intentionally NOT wired for places — "Trouble" is a freeform text field, since a wayside inn or a peak don't have that kind of settlement-scale trouble concept.

#### When to reach for a Place vs a Community

If the answer to "who lives here?" is a group of people who share a settlement identity, that's a **Community** (name it after the settlement). If the answer is "no-one lives there, but I want to remember it exists", or "it's a specific spot within a larger community", that's a **Place**. A campaign's Whitebridge is a Community; the Silver Fish Tavern inside Whitebridge is a Place; the shadow of the Ravaged Peak on the horizon is a Place.

---

## Storage

| Layer        | Detail                                                                                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database     | `user_entities` rows with `kind IN ('community', 'npc', 'place')` (per-entity storage — one row per record). The CHECK constraint was widened in migration `0015_places.sql`. |
| API          | `POST/PATCH/DELETE /api/v1/session/:kind/:id` — the generic per-entity CRUD route in `apps/api/src/routes/userData.ts` handles all three kinds via `KIND_BY_SEGMENT`.         |
| BFF proxy    | `apps/web/src/routes/api/session/[kind]/**` forwards the same shape.                                                                                                          |
| Client store | `communityStore.svelte.ts`, `npcStore.svelte.ts`, `placeStore.svelte.ts` — each is a thin wrapper around `makeEntitySync(<segment>, …)` from `entitySync.ts`.                 |
| Initial load | `loadCommunities()` / `loadNpcs()` / `loadPlaces()` all hit the shared `GET /api/session` (via `fetchSession()`) and seed their slice.                                        |

Store API (mirrored across all three):

```typescript
loadCommunities(): Promise<void>;
getCommunities(): Community[];
addCommunity(c: Community): Promise<void>;
updateCommunity(c: Community): Promise<void>;
removeCommunity(id: string): Promise<void>;
```

Substitute `Npc` / `Place` for the same shape on the other two stores. Mutations are optimistic — the store is updated synchronously, then `makeEntitySync.persist()` diffs against the last-known server snapshot and issues one request per changed row.

---

## UI Structure

Communities tab toolbar:

| Button          | Style     | Action                                                                                                     |
| --------------- | --------- | ---------------------------------------------------------------------------------------------------------- |
| **Ask**         | primary   | Roll the active oracle (settlementName / settlementTrouble / etc., picked via a small in-toolbar dropdown) |
| **+ Community** | primary   | Create a blank community, then optionally fill via Ask buttons inside the card                             |
| **+ NPC**       | primary   | Create a blank NPC                                                                                         |
| **Export**      | secondary | Download all communities + NPCs as JSON                                                                    |

Cards lay out in a 3-column responsive grid (1-col on mobile). See [ui-components.md § Toolbar Button Hierarchy](ui-components.md#toolbar-button-hierarchy) for the primary/secondary rules.

Both `CommunityCard` and `NpcCard` follow the standard collapsible card pattern (header bar + collapsible body, sticky collapse state per [the GCB collapse spec](global-context-bar.md)).

---

## Oracle-Powered Generation

Each text field on a community or NPC has a small "ask oracle" button that rolls the relevant table and fills the field. Fields can also be edited freehand or re-rolled.

### Community fields → oracle keys

Routed in `apps/web/src/routes/home/+page.svelte`:

| Field                 | Oracle key                                                                |
| --------------------- | ------------------------------------------------------------------------- |
| `name`                | `settlementName` or `settlementNameQuick` (50/50 split)                   |
| `region`              | `region` (Ironlands) **or** `yrtRegion` when YRT region radio is selected |
| `location`            | `location` (inland) **or** `coastalWatersLocation` (coastal radio)        |
| `locationDescription` | `locationDescriptor`                                                      |
| `trouble`             | `settlementTrouble`                                                       |

The **YRT** region radio is hidden when the YRT [expansion toggle](expansion-toggles.md) is off. Existing communities with YRT regions keep displaying their region label regardless.

### NPC fields → oracle keys

| Field        | Oracle key                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------- |
| `role`       | `characterRole`                                                                               |
| `goal`       | `characterGoal`                                                                               |
| `descriptor` | `characterDescriptor`                                                                         |
| `name`       | `namesIronlander` (default) or `namesOther` (Elf, Giants, Varou, Trolls — a sub-table picker) |

The name oracle selection is sticky per session (`_pendingNpcNameOracle`).

---

## Notes Field

Both cards render the `notes` field as **click-to-edit markdown** via `renderNote()` from `$lib/markdown.js` (the same pattern as Site/Journey notes — see [expeditions.md](expeditions.md)). Supports `**bold**`, `*italic*`, `# heading`, `- list`. No external markdown library; the renderer is a hand-rolled regex parser in `apps/web/src/lib/markdown.ts`.

---

## Portrait Field

Portraits are **not** inlined in the entity JSON. The card uploads the cropped image to the content-addressed blob store via `PUT /api/session/{communities|npcs}/:id/portrait`, and the entity stores only `portraitEtag` (the content hash). The card renders `<img src="/api/session/:kind/:id/portrait?v=<etag>">`, which is cacheable and revalidates with an ETag (304). The legacy inline `imageUrl` base64 field is deprecated — accepted on import and re-embedded on export as the round-trip transport only (see [Portraits in import-schema.md](import-schema.md#portraits)).

---

## Components

| Component                 | File                                  | Purpose                                    |
| ------------------------- | ------------------------------------- | ------------------------------------------ |
| CommunityCard             | `lib/components/CommunityCard.svelte` | Settlement card                            |
| NpcCard                   | `lib/components/NpcCard.svelte`       | NPC card                                   |
| (toolbar + creation flow) | `routes/home/+page.svelte`            | + buttons, Ask dropdown, region-type radio |

## Stores

| Store          | File                           | Purpose                      |
| -------------- | ------------------------------ | ---------------------------- |
| communityStore | `lib/communityStore.svelte.ts` | Community CRUD + persistence |
| npcStore       | `lib/npcStore.svelte.ts`       | NPC CRUD + persistence       |
