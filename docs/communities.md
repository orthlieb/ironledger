# Communities, NPCs & Places

Tracks the settlements you've found, the people who inhabit them, and the individual places (inns, markets, remote sites) that anchor your story. All three are oracle-driven where useful, and free-form everywhere else.

> **Place vs Site**: a Place (a Connection) is a location worth remembering — an inn, a market, a dire forest, a ruin. A Site is a Delve-mechanic expedition with progress ticks + denizen tables. Different concepts, different storage.

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

---

## Storage

| Layer        | Detail                                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Database     | `user_data.communities` and `user_data.npcs` JSONB columns                                                                    |
| API (BFF)    | `PATCH /api/session/communities`, `PATCH /api/session/npcs`                                                                   |
| Client store | `apps/web/src/lib/communityStore.svelte.ts`, `apps/web/src/lib/npcStore.svelte.ts` (module-level `$state`, identical pattern) |
| Initial load | `loadCommunities()` / `loadNpcs()` hits `GET /api/session` and seeds the store                                                |

Store API (mirrored across both):

```typescript
loadCommunities(): Promise<void>;
getCommunities(): Community[];
addCommunity(c: Community): Promise<void>;
updateCommunity(c: Community): Promise<void>;
removeCommunity(id: string): Promise<void>;
```

Mutations are optimistic: the store is updated synchronously, then `persist()` PATCHes the full array to the server. There is no per-record endpoint.

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
