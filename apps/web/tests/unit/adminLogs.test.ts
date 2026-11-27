/**
 * adminLogs.test.ts — parseLogLine, which turns one line of a PM2 log file
 * into the admin Logs tab's timestamp / level / message / extras.
 */
import { describe, it, expect } from 'vitest';
import { parseLogLine, PINO_LEVELS } from '../../src/lib/adminLogs.js';

/** A line as PM2 writes it with `log_type: json`: the process output in `message`. */
function pm2(message: string, extra: Record<string, unknown> = {}): string {
	return JSON.stringify({
		message,
		timestamp: '2026-03-24 06:26:25 +00:00',
		type: 'out',
		...extra,
	});
}

describe('parseLogLine — PM2-wrapped pino JSON', () => {
	it('takes the level, message and extras from pino and trims the PM2 timestamp', () => {
		const pino = JSON.stringify({
			level: 40,
			time: 1774333585000,
			pid: 123,
			hostname: 'web-1',
			msg: 'slow query',
			v: 1,
			reqId: 'req-7',
			ms: 812,
		});
		const raw = pm2(pino);
		expect(parseLogLine(raw)).toEqual({
			ts: '03-24 06:26:25',
			level: 'WARN',
			levelNum: 40,
			msg: 'slow query',
			extras: { reqId: 'req-7', ms: 812 },
			raw,
		});
	});

	it('maps every pino level number to its name', () => {
		for (const [num, name] of Object.entries(PINO_LEVELS)) {
			const line = parseLogLine(pm2(JSON.stringify({ level: Number(num), msg: 'x' })));
			expect(line.level).toBe(name);
			expect(line.levelNum).toBe(Number(num));
		}
	});

	it('reads a missing level as INFO 30 and an unknown one as INFO', () => {
		expect(parseLogLine(pm2(JSON.stringify({ msg: 'no level' })))).toMatchObject({
			level: 'INFO',
			levelNum: 30,
		});
		expect(parseLogLine(pm2(JSON.stringify({ level: 35, msg: 'odd' })))).toMatchObject({
			level: 'INFO',
			levelNum: 35,
		});
	});

	it('falls back to the inner text when pino has no msg', () => {
		const inner = JSON.stringify({ level: 30, event: 'boot' });
		expect(parseLogLine(pm2(inner))).toMatchObject({ msg: inner, extras: { event: 'boot' } });
	});

	it("uses pino's own time, as local HH:MM:SS, when PM2 gives no timestamp", () => {
		const time = Date.UTC(2026, 2, 24, 6, 26, 25);
		const raw = JSON.stringify({ message: JSON.stringify({ level: 30, time, msg: 'hi' }) });
		const expected = new Date(time).toLocaleTimeString('en-US', {
			hour12: false,
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		});
		expect(parseLogLine(raw).ts).toBe(expected);
		expect(expected).toMatch(/^\d{2}:\d{2}:\d{2}$/);
	});

	it('keeps a PM2 timestamp shorter than 19 characters as it is', () => {
		const raw = JSON.stringify({ message: JSON.stringify({ msg: 'x' }), timestamp: '06:26:25' });
		expect(parseLogLine(raw).ts).toBe('06:26:25');
	});
});

describe('parseLogLine — PM2-wrapped plain text', () => {
	it('is an ERROR when PM2 says the line went to stderr', () => {
		const raw = pm2('something broke', { type: 'err' });
		expect(parseLogLine(raw)).toEqual({
			ts: '03-24 06:26:25',
			level: 'ERROR',
			levelNum: 50,
			msg: 'something broke',
			extras: {},
			raw,
		});
	});

	it('finds ERROR, then WARN, then lower-case debug in stdout text', () => {
		expect(parseLogLine(pm2('ERROR: disk full'))).toMatchObject({ level: 'ERROR', levelNum: 50 });
		expect(parseLogLine(pm2('WARN deprecated flag'))).toMatchObject({
			level: 'WARN',
			levelNum: 40,
		});
		expect(parseLogLine(pm2('vite:debug hmr update'))).toMatchObject({
			level: 'DEBUG',
			levelNum: 20,
		});
		// The plain-text check is case-sensitive: upper-case DEBUG is INFO here.
		expect(parseLogLine(pm2('DEBUG cache miss'))).toMatchObject({ level: 'INFO', levelNum: 30 });
		expect(parseLogLine(pm2('Listening on :3000'))).toMatchObject({
			level: 'INFO',
			levelNum: 30,
			msg: 'Listening on :3000',
			extras: {},
		});
	});
});

describe('parseLogLine — raw lines (not JSON)', () => {
	it('keeps the whole line as the message, with no timestamp', () => {
		const raw = 'Server started on port 3000';
		expect(parseLogLine(raw)).toEqual({
			ts: '',
			level: 'INFO',
			levelNum: 30,
			msg: raw,
			extras: {},
			raw,
		});
	});

	it('finds ERROR, WARN or upper-case DEBUG in the text, levelNum staying 30', () => {
		expect(parseLogLine('[ERROR] boom')).toMatchObject({ level: 'ERROR', levelNum: 30 });
		expect(parseLogLine('[WARN] careful')).toMatchObject({ level: 'WARN', levelNum: 30 });
		expect(parseLogLine('[DEBUG] detail')).toMatchObject({ level: 'DEBUG', levelNum: 30 });
		expect(parseLogLine('[debug] detail')).toMatchObject({ level: 'INFO', levelNum: 30 });
	});

	it('treats a truncated JSON line as raw text', () => {
		const raw = '{"message":"cut off';
		expect(parseLogLine(raw)).toMatchObject({ ts: '', msg: raw, raw });
	});
});
