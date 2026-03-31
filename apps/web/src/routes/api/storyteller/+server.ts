/**
 * SvelteKit API route for the AI Storyteller.
 *
 * POST /api/storyteller
 *
 * Accepts game context (character, foe, expedition, recent log) and streams
 * back a narrative response from the Claude API. The Anthropic API key lives
 * server-side only — the browser never sees it.
 *
 * Returns a streaming text/event-stream response so the UI can render tokens
 * incrementally.
 */
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { ANTHROPIC_API_KEY } from '$lib/server/config.js';

const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS   = 300;

const SYSTEM_PROMPT = `You are the narrator for an Ironsworn tabletop RPG session. Your role is to provide vivid, concise narrative commentary on the action as it unfolds.

Guidelines:
- Write in second person ("You…") addressing the player character.
- Keep each response to 2–4 sentences — punchy and evocative, not verbose.
- Match the dark, gritty tone of the Ironsworn setting (low fantasy, perilous wilds, iron vows).
- React to what just happened: dice outcomes, new foes, journey progress, notes, etc.
- Reference the character's name, stats, and situation when relevant.
- On a Strong Hit, convey triumph or momentum. On a Weak Hit, tension and cost. On a Miss, peril and setback.
- Never invent game-mechanical effects — only narrate flavour.
- If the player added a note, weave it into the narrative naturally.
- Do not use markdown formatting — plain prose only.`;

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.accessToken) throw error(401, 'Not authenticated');
	if (!ANTHROPIC_API_KEY) throw error(503, 'AI Storyteller is not configured (missing ANTHROPIC_API_KEY)');

	const body = await request.json() as {
		character?: Record<string, unknown>;
		foe?:       Record<string, unknown>;
		expedition?: Record<string, unknown>;
		recentLog:  string[];
		trigger:    string;
	};

	// Build the user message with game context
	const parts: string[] = [];

	if (body.character) {
		parts.push(`## Current Character\n${JSON.stringify(body.character, null, 1)}`);
	}
	if (body.foe) {
		parts.push(`## Active Foe\n${JSON.stringify(body.foe, null, 1)}`);
	}
	if (body.expedition) {
		parts.push(`## Active Expedition\n${JSON.stringify(body.expedition, null, 1)}`);
	}
	if (body.recentLog?.length) {
		parts.push(`## Recent Session Log (newest first)\n${body.recentLog.join('\n')}`);
	}

	parts.push(`## What Just Happened\n${body.trigger}`);

	const userMessage = parts.join('\n\n');

	// Call Anthropic Messages API with streaming
	const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'Content-Type':      'application/json',
			'x-api-key':         ANTHROPIC_API_KEY,
			'anthropic-version': '2023-06-01',
		},
		body: JSON.stringify({
			model:      CLAUDE_MODEL,
			max_tokens: MAX_TOKENS,
			system:     SYSTEM_PROMPT,
			stream:     true,
			messages:   [{ role: 'user', content: userMessage }],
		}),
	});

	if (!apiRes.ok) {
		const errBody = await apiRes.text();
		console.error('[storyteller] Anthropic API error:', apiRes.status, errBody);
		throw error(502, 'AI Storyteller service unavailable');
	}

	// Pipe the SSE stream straight through to the client
	return new Response(apiRes.body, {
		status: 200,
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
		},
	});
};
