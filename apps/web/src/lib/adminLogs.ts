/**
 * Admin log viewer — turns one raw line of a PM2 log file into the fields the
 * Logs tab shows (`AdminLogs.svelte`).
 *
 * A line comes in one of three shapes:
 *
 * - PM2-wrapped pino JSON: `{"message":"{\"level\":30,\"msg\":…}","timestamp":…}`.
 *   The level comes from pino's number (INFO when it has none), the message
 *   from `msg`, and every field but `level`, `msg` and pino's boilerplate
 *   (`time`, `pid`, `hostname`, `v`) is kept as an extra.
 * - PM2-wrapped plain text: `{"message":"some text","type":"out"|"err",…}`.
 *   `type: "err"` means ERROR; otherwise the text decides: `ERROR`, `WARN`,
 *   then lower-case `debug`, else INFO.
 * - Anything else (not JSON): the raw line, its level found the same way but
 *   with upper-case `DEBUG`; `levelNum` stays 30 whatever the level.
 *
 * A PM2 timestamp (`2026-03-24 06:26:25 +00:00`) is trimmed to
 * `MM-DD HH:MM:SS`. Without one, a pino line shows its own `time` as local
 * `HH:MM:SS`.
 */

export const PINO_LEVELS: Record<number, string> = {
	10: 'TRACE',
	20: 'DEBUG',
	30: 'INFO',
	40: 'WARN',
	50: 'ERROR',
	60: 'FATAL',
};

export interface ParsedLine {
	ts: string;
	level: string;
	levelNum: number;
	msg: string;
	extras: Record<string, unknown>;
	raw: string;
}

export function parseLogLine(raw: string): ParsedLine {
	try {
		const pm2 = JSON.parse(raw);
		const innerStr: string = pm2.message ?? raw;
		const rawTs: string = pm2.timestamp ?? '';
		// Trim '2026-03-24 06:26:25 +00:00' -> '03-24 06:26:25'
		const pm2ts =
			rawTs.length >= 19
				? rawTs.slice(5, 19) // 'MM-DD HH:MM:SS'
				: rawTs;
		try {
			const p = JSON.parse(innerStr);
			const levelNum = typeof p.level === 'number' ? p.level : 30;
			const { level: _l, time: _t, pid: _p, hostname: _h, msg, v: _v, ...extras } = p;
			const ts =
				pm2ts ||
				(p.time
					? new Date(p.time).toLocaleTimeString('en-US', {
							hour12: false,
							hour: '2-digit',
							minute: '2-digit',
							second: '2-digit',
						})
					: '');
			return {
				ts,
				level: PINO_LEVELS[levelNum] ?? 'INFO',
				levelNum,
				msg: msg ?? innerStr,
				extras,
				raw,
			};
		} catch {
			// Inner message is plain text -- use PM2 type field to infer level
			const level =
				pm2.type === 'err'
					? 'ERROR'
					: innerStr.includes('ERROR')
						? 'ERROR'
						: innerStr.includes('WARN')
							? 'WARN'
							: innerStr.includes('debug')
								? 'DEBUG'
								: 'INFO';
			const levelNum = level === 'ERROR' ? 50 : level === 'WARN' ? 40 : level === 'DEBUG' ? 20 : 30;
			return { ts: pm2ts, level, levelNum, msg: innerStr, extras: {}, raw };
		}
	} catch {
		const level = raw.includes('ERROR')
			? 'ERROR'
			: raw.includes('WARN')
				? 'WARN'
				: raw.includes('DEBUG')
					? 'DEBUG'
					: 'INFO';
		return { ts: '', level, levelNum: 30, msg: raw, extras: {}, raw };
	}
}
