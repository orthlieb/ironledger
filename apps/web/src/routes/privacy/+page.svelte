<script lang="ts">
	/**
	 * /privacy — the privacy notice. Public, like /about.
	 *
	 * Keep it true: each claim here has a counterpart in the code. The
	 * 90 days is SECURITY_LOG_RETENTION_DAYS (apps/api retentionService.ts),
	 * the 30 days is RETAIN_DAYS in infra/scripts/backup.sh, the outside
	 * services are the ones the app calls (mailer, hCaptcha, HIBP, Google
	 * Fonts in app.html, the AI providers). Change one, change this page
	 * and its date.
	 */
	import { headingText } from '#lib/fontStore.svelte.js';
	import { PRIVACY_EMAIL } from '#lib/contact.js';

	// Shown as "Last updated": change it whenever the notice's text changes.
	const UPDATED = '16 November 2026';
</script>

<svelte:head>
	<title>Privacy · Iron Ledger</title>
</svelte:head>

<article class="privacy">
	<div class="pv-hero">
		<img
			src="/ironledger-privacy.webp"
			alt="A cloaked warrior listens at the keyhole of a locked, iron-banded door between burning torches, watched by a carved stone guardian and a red-eyed raven"
			width="1024"
			height="572"
		/>
	</div>
	<h1 class="pv-title">{headingText('Privacy')}</h1>
	<p class="pv-updated">Last updated {UPDATED}</p>

	<p>
		Iron Ledger is a free, fan-made companion for Ironsworn. This page sets out what it keeps about
		you, why, who else sees any of it, and how to take it with you or delete it.
	</p>

	<h2>{headingText('The short version')}</h2>
	<ul>
		<li>
			We keep what you need to sign in, and the campaign you build. Nothing is sold, and there are
			no ads or trackers.
		</li>
		<li>
			A few outside services do part of the work: sending email, stopping bots, checking passwords
			against known breaches, serving fonts, and writing stories if you turn the AI storyteller on.
		</li>
		<li>
			You can download everything (☰ → Export) and delete your account and all of it at any time
			(☰ → Settings → Account).
		</li>
	</ul>

	<h2>{headingText('What we keep, and why')}</h2>
	<p>
		<strong>Your account.</strong> Your email address, the display name you choose, and your password,
		stored only as a one-way hash that can't be turned back into the password. The address is used to
		confirm it's yours, to send a password-reset link when you ask for one, and to reach you about your
		account. No newsletters.
	</p>
	<p>
		<strong>Your campaign.</strong> Everything you create: characters, connections, expeditions, foes,
		maps and the pictures you upload, the log, and your content-pack and storyteller settings. It's kept
		so you can play from any device. Other players can't see it. The people who run Iron Ledger can see
		the list of accounts (email, display name, when each last signed in) to look after the service.
	</p>
	<p>
		<strong>AI keys.</strong> If you add a key for Claude, ChatGPT or Gemini, it's stored encrypted and
		used only to send your story requests to that provider. It's never shown again, to anyone.
	</p>
	<p>
		<strong>Security records.</strong> When someone registers, signs in or fails to, or resets a password,
		we record the time, the IP address, the browser's description of itself and, for some of these, the
		email address entered. That's how attacks on accounts are spotted and stopped. These records are deleted
		after 90 days.
	</p>
	<p>
		<strong>Server logs.</strong> The servers also keep routine technical logs, which include IP addresses,
		to diagnose problems.
	</p>
	<p>
		We keep your account and campaign because you've asked us to run them for you. Security records
		and server logs are kept because protecting accounts and keeping the service working are
		legitimate needs.
	</p>

	<h2>{headingText('Who else sees any of it')}</h2>
	<ul>
		<li><strong>IONOS</strong> hosts the servers and the database.</li>
		<li>
			<strong>Our email provider</strong> delivers the verification and password emails, so it sees your
			address and those emails.
		</li>
		<li>
			<strong>hCaptcha</strong> runs the "are you human" check on the sign-up, sign-in and password
			pages. It sees your IP address and details of your browser, under
			<a href="https://www.hcaptcha.com/privacy" target="_blank" rel="noopener noreferrer"
				>hCaptcha's privacy policy</a
			>.
		</li>
		<li>
			<strong>Have I Been Pwned</strong> is asked whether a new password has turned up in a known data
			breach. It receives only the first five characters of a hash of the password: never the password
			itself, and nothing that identifies you.
		</li>
		<li>
			<strong>Google Fonts</strong> serves the typefaces, so Google sees your IP address when a page loads.
		</li>
		<li>
			<strong>Anthropic, OpenAI or Google</strong>, only if you turn the AI storyteller on with your
			own key. When you ask for a story, the log entries and instructions you send go to the
			provider you picked, under its terms.
		</li>
	</ul>
	<p>No one else. Nothing is sold or shared for advertising.</p>

	<h2>{headingText('Cookies and browser storage')}</h2>
	<p>
		Iron Ledger sets only the cookies it needs to work: two that keep you signed in, a third if you
		tick "Remember me", and a short-lived one that remembers whether you asked for the starter world
		while you verify your email. There are no advertising or analytics cookies. Display preferences
		(theme, dice, panel sizes and the like) are saved in your browser, not on our servers, and your
		browser's settings can clear them.
	</p>

	<h2>{headingText('How long it’s kept')}</h2>
	<p>
		Your account and campaign are kept until you delete them. When you do, they're removed at once;
		the copies in our encrypted nightly backups age out within 30 days. Security records go after 90
		days.
	</p>

	<h2>{headingText('Your choices')}</h2>
	<ul>
		<li>
			<strong>Take it with you:</strong> ☰ → Export downloads everything as a backup file you can read,
			keep or import again.
		</li>
		<li>
			<strong>Delete it:</strong> ☰ → Settings → Account → Delete my account removes your account and
			everything in it, for good.
		</li>
		<li>
			<strong>Ask:</strong> for anything else, such as a copy of the security records about you or a
			correction, write to <a href="mailto:{PRIVACY_EMAIL}">{PRIVACY_EMAIL}</a>.
		</li>
	</ul>
	<p>
		If you're in the EU or the UK these are your rights under the GDPR, and you can also complain to
		your local data protection authority.
	</p>

	<p class="pv-back"><a href="/about">About Iron Ledger</a> · <a href="/login">Sign in</a></p>
</article>

<style>
	.privacy {
		max-width: 68ch;
		margin: 0 auto;
		padding: 1.5rem var(--page-gutter) 3rem;
		font-family: var(--font-body);
		color: var(--text-muted);
		line-height: 1.7;
	}

	/* Framed like the About page's hero image. */
	.pv-hero {
		margin: 0 0 1.25rem;
		border-radius: 10px;
		overflow: hidden;
		box-shadow: 0 12px 48px rgba(0, 0, 0, 0.45);
		border: 1px solid var(--border-mid);
	}

	.pv-hero img {
		display: block;
		width: 100%;
		height: auto;
	}

	.pv-title {
		font-family: var(--font-display);
		font-size: clamp(1.5rem, 4vw, 2rem);
		font-weight: 700;
		letter-spacing: 0.05em;
		color: var(--text-accent);
		margin: 0;
	}

	.pv-updated {
		font-family: var(--font-ui);
		font-size: 0.8rem;
		color: var(--text-dimmer);
		margin: 0.25rem 0 1.25rem;
	}

	h2 {
		font-family: var(--font-display);
		font-size: clamp(1.05rem, 2.6vw, 1.3rem);
		font-weight: 700;
		letter-spacing: 0.04em;
		color: var(--text-accent);
		margin: 2rem 0 0.6rem;
	}

	p,
	li {
		font-size: 1rem;
	}

	p {
		margin: 0 0 0.9rem;
	}

	ul {
		margin: 0 0 0.9rem;
		padding-left: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	strong {
		color: var(--text);
		font-weight: 600;
	}

	a {
		color: var(--text-accent);
	}

	.pv-back {
		margin-top: 2.5rem;
		font-family: var(--font-ui);
		font-size: 0.9rem;
	}
</style>
