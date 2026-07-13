/**
 * AI storyteller config service — per-provider settings, one row per
 * (user, provider). Provider API keys are stored encrypted at rest and never
 * returned to clients (the config view exposes only `hasKey`). At most one
 * provider is active per user; none active = the "None" storyteller.
 */
import { withUserContext } from '../db/index.js';
import { sql } from 'drizzle-orm';
import { config } from '../config.js';
import { encryptSecret, decryptSecret } from './aiCrypto.js';

export type AiProvider = 'claude' | 'chatgpt' | 'gemini';
export const AI_PROVIDERS: AiProvider[] = ['claude', 'chatgpt', 'gemini'];

/** Narrow an arbitrary string (e.g. a DB value) to a known provider. */
export function isAiProvider(v: unknown): v is AiProvider {
  return v === 'claude' || v === 'chatgpt' || v === 'gemini';
}

export const DEFAULT_MODEL: Record<AiProvider, string> = {
  claude: 'claude-haiku-4-5',
  chatgpt: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
};

/** The encryption secret, or throw a clear error if the feature is unconfigured. */
function encSecret(): string {
  if (!config.AI_KEY_ENC_SECRET) {
    throw new Error('AI_KEY_ENC_SECRET is not configured — AI storytellers are unavailable.');
  }
  return config.AI_KEY_ENC_SECRET;
}

export interface ProviderConfigView {
  model: string | null;
  hasKey: boolean;
}
export interface AiConfigView {
  activeProvider: AiProvider | null;
  providers: Record<AiProvider, ProviderConfigView>;
}

interface Row {
  provider: AiProvider;
  model: string | null;
  active: boolean;
  key_ciphertext: string | null;
  key_iv: string | null;
  key_tag: string | null;
}

/** Full config for the settings UI — keys elided to `hasKey`. */
export async function getConfig(userId: string): Promise<AiConfigView> {
  const rows = (await withUserContext(userId, (tx) =>
    tx.execute(sql`
      SELECT provider, model, active, key_ciphertext
      FROM ai_config WHERE user_id = ${userId}::uuid
    `),
  )) as unknown as Row[];

  const providers: Record<AiProvider, ProviderConfigView> = {
    claude: { model: null, hasKey: false },
    chatgpt: { model: null, hasKey: false },
    gemini: { model: null, hasKey: false },
  };
  let activeProvider: AiProvider | null = null;
  for (const r of rows) {
    if (!isAiProvider(r.provider)) continue;
    providers[r.provider] = { model: r.model, hasKey: !!r.key_ciphertext };
    if (r.active) activeProvider = r.provider;
  }
  return { activeProvider, providers };
}

/** Set the model (and optionally the key) for one provider. */
export async function setProviderConfig(
  userId: string,
  provider: AiProvider,
  patch: { model: string; key?: string },
): Promise<void> {
  const enc =
    patch.key !== undefined && patch.key !== '' ? encryptSecret(patch.key, encSecret()) : null;

  await withUserContext(userId, async (tx) => {
    if (enc) {
      await tx.execute(sql`
        INSERT INTO ai_config (user_id, provider, model, key_ciphertext, key_iv, key_tag, updated_at)
        VALUES (${userId}::uuid, ${provider}, ${patch.model}, ${enc.ciphertext}, ${enc.iv}, ${enc.tag}, now())
        ON CONFLICT (user_id, provider) DO UPDATE SET
          model = EXCLUDED.model,
          key_ciphertext = EXCLUDED.key_ciphertext, key_iv = EXCLUDED.key_iv, key_tag = EXCLUDED.key_tag,
          updated_at = now()
      `);
    } else {
      await tx.execute(sql`
        INSERT INTO ai_config (user_id, provider, model, updated_at)
        VALUES (${userId}::uuid, ${provider}, ${patch.model}, now())
        ON CONFLICT (user_id, provider) DO UPDATE SET
          model = EXCLUDED.model, updated_at = now()
      `);
    }
  });
}

/** Select the active storyteller (or `null` for None). */
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

/** Clear the stored key for a provider (leaves the model). */
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
}

/**
 * Resolve the active provider's config with the key decrypted — for server-side
 * generation. Returns null when there's no active provider or it has no key.
 */
export async function getActiveForGeneration(userId: string): Promise<ActiveAiConfig | null> {
  const rows = (await withUserContext(userId, (tx) =>
    tx.execute(sql`
      SELECT provider, model, key_ciphertext, key_iv, key_tag
      FROM ai_config WHERE user_id = ${userId}::uuid AND active = true LIMIT 1
    `),
  )) as unknown as Row[];

  const r = rows[0];
  if (!r || !r.key_ciphertext || !r.key_iv || !r.key_tag) return null;
  if (!isAiProvider(r.provider)) return null;

  const apiKey = decryptSecret(
    { ciphertext: r.key_ciphertext, iv: r.key_iv, tag: r.key_tag },
    encSecret(),
  );
  return {
    provider: r.provider,
    apiKey,
    model: r.model ?? DEFAULT_MODEL[r.provider],
  };
}
