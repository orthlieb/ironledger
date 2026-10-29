/**
 * github-progress-status — a Playwright reporter that keeps a GitHub commit
 * status named "E2E progress" up to date with "n/m passed" while the suite
 * runs.
 *
 * GitHub serves a job's log only once the job has finished, so nothing
 * outside the runner can count tests mid-run. A commit status can be read at
 * any time (`GET /repos/{repo}/commits/{sha}/status` → the latest per
 * context), which is how the /engage CI watcher reports a live count. It's a
 * commit status rather than a check run on purpose: a check run created with
 * the workflow token lands in whichever Actions check suite GitHub picks for
 * the commit (it showed up under Deploy), while a status belongs to no
 * workflow. Its link goes to this E2E run.
 *
 * Active only when GITHUB_TOKEN, GITHUB_REPOSITORY and PROGRESS_SHA are set
 * (the E2E workflow sets them; PROGRESS_SHA is the PR's head commit on a pull
 * request, so the status shows on the PR). Anywhere else, including local
 * runs, it does nothing. It never fails the test run: the first API error
 * turns it off with one warning.
 */
import type {
	FullConfig,
	FullResult,
	Reporter,
	Suite,
	TestCase,
	TestResult,
} from '@playwright/test/reporter';

const CONTEXT = 'E2E progress';
/** At most one update per interval while tests run (plus the first and last). */
const UPDATE_EVERY_MS = 15_000;
/** GitHub's limit on a status description. */
const MAX_DESCRIPTION = 140;

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

/** "212/270 passed, 1 failed · 1 flaky · 0 skipped · 56 to run" */
function describe(t: Tally): string {
	const ok = t.passed + t.flaky;
	const left = t.total - ok - t.failed - t.skipped;
	return [
		`${ok}/${t.total} passed` + (t.failed ? `, ${t.failed} failed` : ''),
		`${t.flaky} flaky`,
		`${t.skipped} skipped`,
		`${left} to run`,
	]
		.join(' · ')
		.slice(0, MAX_DESCRIPTION);
}

type State = 'pending' | 'success' | 'failure' | 'error';

const FINAL_STATE: Record<FullResult['status'], State> = {
	passed: 'success',
	failed: 'failure',
	timedout: 'error',
	interrupted: 'error',
};

export default class GitHubProgressStatus implements Reporter {
	private readonly token = process.env.GITHUB_TOKEN;
	private readonly repo = process.env.GITHUB_REPOSITORY;
	private readonly sha = process.env.PROGRESS_SHA;
	private readonly api = process.env.GITHUB_API_URL ?? 'https://api.github.com';
	private readonly runUrl = process.env.GITHUB_RUN_ID
		? `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${this.repo}/actions/runs/${process.env.GITHUB_RUN_ID}`
		: undefined;
	private enabled = !!(this.token && this.repo && this.sha);
	private suite?: Suite;
	private lastSent = 0;
	/** Requests run one at a time, in order. */
	private queue: Promise<void> = Promise.resolve();

	printsToStdio(): boolean {
		return false;
	}

	onBegin(_config: FullConfig, suite: Suite): void {
		if (!this.enabled) return;
		this.suite = suite;
		this.post('pending');
	}

	onTestEnd(_test: TestCase, _result: TestResult): void {
		if (!this.enabled || !this.suite || Date.now() - this.lastSent < UPDATE_EVERY_MS) return;
		this.post('pending');
	}

	async onEnd(result: FullResult): Promise<void> {
		if (!this.enabled || !this.suite) return;
		this.post(FINAL_STATE[result.status]);
		await this.queue;
	}

	/** Queue a status with the tally as of now. */
	private post(state: State): void {
		if (!this.suite) return;
		this.lastSent = Date.now();
		const body = {
			state,
			context: CONTEXT,
			description: describe(tally(this.suite)),
			...(this.runUrl ? { target_url: this.runUrl } : {}),
		};
		this.queue = this.queue.then(async () => {
			if (!this.enabled) return;
			try {
				const res = await fetch(`${this.api}/repos/${this.repo}/statuses/${this.sha}`, {
					method: 'POST',
					headers: {
						authorization: `Bearer ${this.token}`,
						accept: 'application/vnd.github+json',
						'content-type': 'application/json',
						'x-github-api-version': '2022-11-28',
					},
					body: JSON.stringify(body),
				});
				if (!res.ok) throw new Error(`POST statuses → HTTP ${res.status}`);
			} catch (e) {
				this.enabled = false;
				console.warn(`[github-progress-status] disabled after an API error: ${String(e)}`);
			}
		});
	}
}
