/**
 * github-check-progress — a Playwright reporter that keeps a GitHub check run
 * named "E2E progress" up to date with "n/m passed" while the suite runs.
 *
 * GitHub serves a job's log only once the job has finished, so nothing
 * outside the runner can count tests mid-run. A check run can be read at any
 * time (`GET /repos/{repo}/commits/{sha}/check-runs?check_name=E2E%20progress`),
 * which is how the /engage CI watcher reports a live count.
 *
 * Active only when GITHUB_TOKEN, GITHUB_REPOSITORY and PROGRESS_SHA are set
 * (the E2E workflow sets them; PROGRESS_SHA is the PR's head commit on a pull
 * request, so the check shows on the PR). Anywhere else, including local runs,
 * it does nothing. It never fails the test run: the first API error turns it
 * off with one warning.
 */
import type {
	FullConfig,
	FullResult,
	Reporter,
	Suite,
	TestCase,
	TestResult,
} from '@playwright/test/reporter';

const CHECK_NAME = 'E2E progress';
/** At most one update per interval while tests run (plus the first and last). */
const UPDATE_EVERY_MS = 15_000;

interface Tally {
	total: number;
	passed: number;
	flaky: number;
	failed: number;
	skipped: number;
}

/** Each test's state from its latest attempt; one still due a retry isn't done. */
function tally(suite: Suite): Tally {
	const t: Tally = { total: 0, passed: 0, flaky: 0, failed: 0, skipped: 0 };
	for (const test of suite.allTests()) {
		t.total++;
		const last = test.results.at(-1);
		if (!last) continue;
		if (last.status === 'skipped') t.skipped++;
		else if (last.status === test.expectedStatus) {
			if (test.results.length > 1) t.flaky++;
			else t.passed++;
		} else if (last.status === 'interrupted' || test.results.length > test.retries) t.failed++;
	}
	return t;
}

function title(t: Tally): string {
	const ok = t.passed + t.flaky;
	return `${ok}/${t.total} passed` + (t.failed ? `, ${t.failed} failed` : '');
}

function summary(t: Tally): string {
	const left = t.total - t.passed - t.flaky - t.failed - t.skipped;
	return [
		`${t.passed} passed`,
		`${t.flaky} flaky (passed on retry)`,
		`${t.failed} failed`,
		`${t.skipped} skipped`,
		`${left} still to run`,
	].join(' · ');
}

const CONCLUSION: Record<FullResult['status'], string> = {
	passed: 'success',
	failed: 'failure',
	timedout: 'timed_out',
	interrupted: 'cancelled',
};

export default class GitHubCheckProgress implements Reporter {
	private readonly token = process.env.GITHUB_TOKEN;
	private readonly repo = process.env.GITHUB_REPOSITORY;
	private readonly sha = process.env.PROGRESS_SHA;
	private readonly api = process.env.GITHUB_API_URL ?? 'https://api.github.com';
	private enabled = !!(this.token && this.repo && this.sha);
	private suite?: Suite;
	private checkId?: number;
	private lastSent = 0;
	/** Requests run one at a time, in order. */
	private queue: Promise<void> = Promise.resolve();

	printsToStdio(): boolean {
		return false;
	}

	onBegin(_config: FullConfig, suite: Suite): void {
		if (!this.enabled) return;
		this.suite = suite;
		const t = tally(suite);
		this.enqueue(async () => {
			const res = await this.request('POST', `/repos/${this.repo}/check-runs`, {
				name: CHECK_NAME,
				head_sha: this.sha,
				status: 'in_progress',
				started_at: new Date().toISOString(),
				output: { title: title(t), summary: summary(t) },
			});
			this.checkId = ((await res.json()) as { id: number }).id;
		});
		this.lastSent = Date.now();
	}

	onTestEnd(_test: TestCase, _result: TestResult): void {
		if (!this.enabled || !this.suite || Date.now() - this.lastSent < UPDATE_EVERY_MS) return;
		this.lastSent = Date.now();
		const t = tally(this.suite);
		this.enqueue(() => this.update({ output: { title: title(t), summary: summary(t) } }));
	}

	async onEnd(result: FullResult): Promise<void> {
		if (!this.enabled || !this.suite) return;
		const t = tally(this.suite);
		this.enqueue(() =>
			this.update({
				status: 'completed',
				conclusion: CONCLUSION[result.status],
				completed_at: new Date().toISOString(),
				output: { title: title(t), summary: summary(t) },
			}),
		);
		await this.queue;
	}

	private enqueue(task: () => Promise<void>): void {
		this.queue = this.queue.then(async () => {
			if (!this.enabled) return;
			try {
				await task();
			} catch (e) {
				this.enabled = false;
				console.warn(`[github-check-progress] disabled after an API error: ${String(e)}`);
			}
		});
	}

	private async update(body: Record<string, unknown>): Promise<void> {
		if (this.checkId === undefined) return;
		await this.request('PATCH', `/repos/${this.repo}/check-runs/${this.checkId}`, body);
	}

	private async request(method: string, path: string, body: unknown): Promise<Response> {
		const res = await fetch(this.api + path, {
			method,
			headers: {
				authorization: `Bearer ${this.token}`,
				accept: 'application/vnd.github+json',
				'content-type': 'application/json',
				'x-github-api-version': '2022-11-28',
			},
			body: JSON.stringify(body),
		});
		if (!res.ok) throw new Error(`${method} ${path} → HTTP ${res.status}`);
		return res;
	}
}
