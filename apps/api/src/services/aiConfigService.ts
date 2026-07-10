/**
 * AI companion config service — per-provider settings, one row per
 * (user, provider). Provider API keys are stored encrypted at rest and never
 * returned to clients (the config view exposes only `hasKey`). At most one
 * provider is active per user; none active = the "None" companion.
 */
import { withUserContext } from '../db/index.js';
import { sql } from 'drizzle-orm';
import { config } from '../config.js';
import { encryptSecret, decryptSecret } from './aiCrypto.js';

export type AiProvider = 'claude' | 'chatgpt';
export const AI_PROVIDERS: AiProvider[] = ['claude', 'chatgpt'];

export const DEFAULT_MODEL: Record<AiProvider, string> = {
  claude: 'claude-haiku-4-5',
  chatgpt: 'gpt-4o-mini',
};

/** The encryption secret, or throw a clear error if the feature is unconfigured. */
function encSecret(): string {
  if (!config.AI_KEY_ENC_SECRET) {
    throw new Error('AI_KEY_ENC_SECRET is not configured — AI companions are unavailable.');
  }
  return config.AI_KEY_ENC_SECRET;
}

export interface ProviderConfigView {
  model: string | null;
  setup: string | null;
  hasKey: boolean;
}
export interface AiConfigView {
  activeProvider: AiProvider | null;
  providers: Record<AiProvider, ProviderConfigView>;
}

interface Row {
  provider: AiProvider;
  model: string | null;
  setup: string | null;
  active: boolean;
  key_ciphertext: string | null;
  key_iv: string | null;
  key_tag: string | null;
}

/** Full config for the settings UI — keys elided to `hasKey`. */
export async function getConfig(userId: string): Promise<AiConfigView> {
  const rows = (await withUserContext(userId, (tx) =>
    tx.execute(sql`
      SELECT provider, model, setup, active, key_ciphertext
      FROM ai_config WHERE user_id = ${userId}::uuid
    `),
  )) as unknown as Row[];

  const providers: Record<AiProvider, ProviderConfigView> = {
    claude: { model: null, setup: null, hasKey: false },
    chatgpt: { model: null, setup: null, hasKey: false },
  };
  let activeProvider: AiProvider | null = null;
  for (const r of rows) {
    if (r.provider !== 'claude' && r.provider !== 'chatgpt') continue;
    providers[r.provider] = { model: r.model, setup: r.setup, hasKey: !!r.key_ciphertext };
    if (r.active) activeProvider = r.provider;
  }
  return { activeProvider, providers };
}

/** Set model/setup (and optionally the key) for one provider. */
export async function setProviderConfig(
  userId: string,
  provider: AiProvider,
  patch: { model: string; setup: string; key?: string },
): Promise<void> {
  const enc =
    patch.key !== undefined && patch.key !== '' ? encryptSecret(patch.key, encSecret()) : null;

  await withUserContext(userId, async (tx) => {
    if (enc) {
      await tx.execute(sql`
        INSERT INTO ai_config (user_id, provider, model, setup, key_ciphertext, key_iv, key_tag, updated_at)
        VALUES (${userId}::uuid, ${provider}, ${patch.model}, ${patch.setup}, ${enc.ciphertext}, ${enc.iv}, ${enc.tag}, now())
        ON CONFLICT (user_id, provider) DO UPDATE SET
          model = EXCLUDED.model, setup = EXCLUDED.setup,
          key_ciphertext = EXCLUDED.key_ciphertext, key_iv = EXCLUDED.key_iv, key_tag = EXCLUDED.key_tag,
          updated_at = now()
      `);
    } else {
      await tx.execute(sql`
        INSERT INTO ai_config (user_id, provider, model, setup, updated_at)
        VALUES (${userId}::uuid, ${provider}, ${patch.model}, ${patch.setup}, now())
        ON CONFLICT (user_id, provider) DO UPDATE SET
          model = EXCLUDED.model, setup = EXCLUDED.setup, updated_at = now()
      `);
    }
  });
}

/** Select the active companion (or `null` for None). */
export async function setActiveProvider(
  userId: string,
  provider: AiProvider | null,
): Promise<void> {
  await withUserContext(userId, async (tx) => {
    // Clear first so the "one active per user" partial unique index never conflicts.
    await tx.execute(sql`UPDATE ai_config SET active = false WHERE user_id = ${userId}::uuid`);
    if (provider) {
      await tx.execute(sql`
        INSERT INTO ai_config (user_id, provider, active, updated_at)
        VALUES (${userId}::uuid, ${provider}, true, now())
        ON CONFLICT (user_id, provider) DO UPDATE SET active = true, updated_at = now()
      `);
    }
  });
}

/** Clear the stored key for a provider (leaves model/setup). */
export async function clearProviderKey(userId: string, provider: AiProvider): Promise<void> {
  await withUserContext(userId, (tx) =>
    tx.execute(sql`
      UPDATE ai_config SET key_ciphertext = NULL, key_iv = NULL, key_tag = NULL, updated_at = now()
      WHERE user_id = ${userId}::uuid AND provider = ${provider}
    `),
  );
}

/** Decrypt one provider's stored key + model (for the Test endpoint). */
export async function getProviderKey(
  userId: string,
  provider: AiProvider,
): Promise<{ apiKey: string; model: string } | null> {
  const rows = (await withUserContext(userId, (tx) =>
    tx.execute(sql`
      SELECT model, key_ciphertext, key_iv, key_tag
      FROM ai_config WHERE user_id = ${userId}::uuid AND provider = ${provider} LIMIT 1
    `),
  )) as unknown as Row[];
  const r = rows[0];
  if (!r || !r.key_ciphertext || !r.key_iv || !r.key_tag) return null;
  const apiKey = decryptSecret(
    { ciphertext: r.key_ciphertext, iv: r.key_iv, tag: r.key_tag },
    encSecret(),
  );
  return { apiKey, model: r.model ?? DEFAULT_MODEL[provider] };
}

export interface ActiveAiConfig {
  provider: AiProvider;
  apiKey: string;
  model: string;
  setup: string;
}

/**
 * Resolve the active provider's config with the key decrypted — for server-side
 * generation. Returns null when there's no active provider or it has no key.
 */
export async function getActiveForGeneration(userId: string): Promise<ActiveAiConfig | null> {
  const rows = (await withUserContext(userId, (tx) =>
    tx.execute(sql`
      SELECT provider, model, setup, key_ciphertext, key_iv, key_tag
      FROM ai_config WHERE user_id = ${userId}::uuid AND active = true LIMIT 1
    `),
  )) as unknown as Row[];

  const r = rows[0];
  if (!r || !r.key_ciphertext || !r.key_iv || !r.key_tag) return null;
  if (r.provider !== 'claude' && r.provider !== 'chatgpt') return null;

  const apiKey = decryptSecret(
    { ciphertext: r.key_ciphertext, iv: r.key_iv, tag: r.key_tag },
    encSecret(),
  );
  return {
    provider: r.provider,
    apiKey,
    model: r.model ?? DEFAULT_MODEL[r.provider],
    setup: r.setup ?? '',
  };
}
