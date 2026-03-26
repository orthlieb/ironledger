<script lang="ts">
	import swordSvg         from '$icons/sharp-axe.svg?raw';
	import charactersSvg    from '$icons/Characters.svg?raw';
	import foesSvg          from '$icons/Foes.svg?raw';
	import expeditionsSvg   from '$icons/Expeditions.svg?raw';
	import adventureSvg     from '$icons/Adventure.svg?raw';
	import eyeSvg           from '$icons/eye-solid.svg?raw';
	import noteSvg          from '$icons/note-sticky-solid.svg?raw';

	const githubSvg = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>`;

	let { data }: { data: { user?: { name?: string } } } = $props();

	const features = [
		{
			icon: charactersSvg,
			title: 'Character Sheets',
			body: 'Stats, vows, bonds, debilities, XP — everything the Ironlands will hurl at you, and everything you\'ll cling to when the dice betray you. Auto-saved, because the darkness waits for no one.',
			color: 'var(--color-heart)',
		},
		{
			icon: foesSvg,
			title: 'Foe Tracker',
			body: '60+ horrors catalogued for your convenience. Know your enemy before it knows you. (Spoiler: it probably already does.) Track combat progress, mark the fallen, and try not to think about what comes next.',
			color: 'var(--color-danger)',
		},
		{
			icon: expeditionsSvg,
			title: 'Expeditions',
			body: 'The road goes ever on. Track journeys and delves so you remember which haunted barrow nearly claimed you last session. Themes, domains, denizens, progress tracks — all the grim details, preserved.',
			color: 'var(--color-supply)',
		},
		{
			icon: adventureSvg,
			title: 'Moves & Dice',
			body: '48 moves. Animated 3D dice. Strong hits are celebrated. Weak hits are… managed. Misses are logged, linked, and filed under "character development." The oracle sees all.',
			color: 'var(--color-wits)',
		},
		{
			icon: eyeSvg,
			title: 'Oracles',
			body: '49 tables of fate spanning Core Ironsworn, Delve, and the Yrt homebrew expansion. Roll a d100, receive your destiny, and accept what the oracle decrees. It is what it is. Pay the price.',
			color: 'var(--text-muted)',
		},
		{
			icon: noteSvg,
			title: 'Session Log & Notes',
			body: 'Because "I think I swore a vow to avenge the blacksmith" is not a strategy. Every move, roll, and resource shift is captured automatically. Add freeform notes so your saga survives contact with real life.',
			color: 'var(--text-muted)',
		},
	];
</script>

<svelte:head>
	<title>About — Iron Ledger</title>
	<meta name="description" content="Iron Ledger is a digital companion app for Ironsworn — manage characters, foes, expeditions, moves, oracles, and session logs in one place." />
</svelte:head>

<!-- ── Top nav ─────────────────────────────────────────────────────── -->
<nav class="about-nav">
	<a href="/" class="about-nav-brand">
		<span class="about-nav-icon" aria-hidden="true">{@html swordSvg}</span>
		Iron Ledger
	</a>
	{#if data.user}
		<div class="about-nav-links">
			<a href="/home" class="btn btn-primary">Go to App</a>
		</div>
	{/if}
</nav>

<!-- ── Hero ───────────────────────────────────────────────────────── -->
<section class="hero">
	<div class="hero-text">
		<p class="hero-eyebrow">Forged in JavaScript. Tempered by coffee.</p>
		<h1 class="hero-title">Iron Ledger</h1>
		<p class="hero-subtitle">
			The Ironlands are brutal, the dice are fickle, and paper character sheets have a way of disappearing right before a climactic vow. Iron Ledger remembers so you don't have to.
		</p>
		<div class="hero-cta">
			{#if data.user}
				<a href="/home" class="btn btn-primary btn-lg">Continue Your Journey</a>
			{:else}
				<a href="/register" class="btn btn-primary btn-lg">Begin Your Journey</a>
				<a href="/login"    class="btn btn-lg">Sign In</a>
			{/if}
		</div>
	</div>
	<div class="hero-image-wrap">
		<img
			src="/ironledger-login.webp"
			alt="A lone Norse warrior stands before the iron-banded doors of a great mead hall"
			class="hero-image"
		/>
	</div>
</section>

<!-- ── What is Iron Ledger ────────────────────────────────────────── -->
<section class="about-section">
	<div class="about-section-inner">
		<h2 class="section-heading">What is Iron Ledger?</h2>
		<div class="about-prose">
			<p>
				<strong>Ironsworn</strong> is an award-winning solo and co-operative tabletop RPG by Shawn Tomkin —
				a dark, mythic land of iron and stone where you swear oaths on pain of dishonour, face foes that
				would very much prefer you dead, and carve out a legend through nothing but dice, imagination, and
				an unreasonable willingness to suffer.
			</p>
			<p>
				<strong>Iron Ledger</strong> is the companion app that handles the clerical work while you handle
				the heroics. No more mid-session rulebook archaeology. No more paper sheets that vanish between
				sessions. No more "wait, did I mark that vow as Fulfilled or did I just think really hard about it?"
				Your full chronicle lives here — always saved, always accurate, always ready to witness your next
				catastrophic miss.
			</p>
			<p>
				Built for Ironsworn core, the <em>Delve</em> supplement, and the community <em>Yrt</em> homebrew expansion.
				Iron Ledger takes the game seriously, even when the dice clearly do not.
			</p>
		</div>
	</div>
</section>

<!-- ── Features ──────────────────────────────────────────────────── -->
<section class="features-section">
	<div class="features-section-inner">
		<h2 class="section-heading">Everything You Need at the Table (Except Luck)</h2>
		<div class="feature-grid">
			{#each features as feat}
				<div class="feature-card card">
					<div class="feature-icon" style="color: {feat.color}">
						{@html feat.icon}
					</div>
					<h3 class="feature-title">{feat.title}</h3>
					<p class="feature-body">{feat.body}</p>
				</div>
			{/each}
		</div>
	</div>
</section>

<!-- ── Open Source ───────────────────────────────────────────────── -->
<section class="opensource-section">
	<div class="opensource-inner">
		<div class="opensource-text">
			<h2 class="section-heading">Open Source</h2>
			<p>
				Iron Ledger is free and open source — written by mortals, for mortals who enjoy pretending to be
				mortals in a dark mythic age. The full codebase lives on GitHub. Report a bug, suggest a feature,
				add support for a new supplement, or simply gaze upon it and despair. Contributions are welcome.
				The Ironlands are vast, and there is always more to build.
			</p>
			<a
				href="https://github.com/orthlieb/ironledger"
				target="_blank"
				rel="noopener noreferrer"
				class="github-link"
			>
				<span class="github-link-icon" aria-hidden="true">{@html githubSvg}</span>
				orthlieb/ironledger on GitHub
			</a>
		</div>
	</div>
</section>

<!-- ── Systems ────────────────────────────────────────────────────── -->
<section class="systems-section">
	<div class="systems-section-inner">
		<h2 class="section-heading">Built for These Systems</h2>
		<div class="systems-list">
			<div class="system-badge">
				<span class="system-dot" style="background: var(--text-accent)"></span>
				Core Ironsworn
			</div>
			<div class="system-badge">
				<span class="system-dot" style="background: var(--color-shadow)"></span>
				Ironsworn: Delve
			</div>
			<div class="system-badge">
				<span class="system-dot" style="background: var(--color-touched)"></span>
				Yrt Homebrew Expansion
			</div>
		</div>
		<p class="systems-note">
			Iron Ledger is an independent fan project and is not affiliated with or endorsed by Shawn Tomkin
			or Ironsworn. Ironsworn is released under Creative Commons CC BY 4.0.
		</p>
	</div>
</section>

<!-- ── CTA ───────────────────────────────────────────────────────── -->
<section class="cta-section">
	<div class="cta-inner">
		<h2 class="cta-title">Swear Your First Vow</h2>
		<p class="cta-body">
			Free to use. No iron required. No actual suffering involved — though the dice make no such promises.
		</p>
		<div class="cta-buttons">
			{#if data.user}
				<a href="/home" class="btn btn-primary btn-lg">Go to App</a>
			{:else}
				<a href="/register" class="btn btn-primary btn-lg">Create Account</a>
				<a href="/login"    class="btn btn-lg">Sign In</a>
			{/if}
		</div>
	</div>
</section>

<!-- ── Footer ─────────────────────────────────────────────────────── -->
<footer class="about-footer">
	<span class="about-footer-brand">
		<span aria-hidden="true">{@html swordSvg}</span>
		Iron Ledger
	</span>
	<span class="about-footer-sep">·</span>
	<a href="/about">About</a>
	<span class="about-footer-sep">·</span>
	<a href="/login">Sign In</a>
	<span class="about-footer-sep">·</span>
	<a href="/register">Register</a>
	<span class="about-footer-sep">·</span>
	<a
		href="https://github.com/orthlieb/ironledger"
		target="_blank"
		rel="noopener noreferrer"
		class="about-footer-github"
	>
		<span>{@html githubSvg}</span>
		GitHub
	</a>
</footer>

<style>
	/* ── Nav ───────────────────────────────────────────────────────── */
	.about-nav {
		position: sticky;
		top: 0;
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.7rem var(--page-gutter);
		background: var(--bg-page);
		border-bottom: 1px solid var(--border);
		backdrop-filter: blur(8px);
	}

	.about-nav-brand {
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: var(--font-display);
		font-size: 1.05rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		color: var(--text-accent);
		text-decoration: none;
	}
	.about-nav-brand:hover { filter: brightness(1.15); text-decoration: none; }

	.about-nav-icon {
		display: flex;
		align-items: center;
		color: var(--color-mana);
	}
	.about-nav-icon :global(svg) {
		width: 18px;
		height: 18px;
		fill: currentColor;
	}

	.about-nav-links {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	/* ── Hero ──────────────────────────────────────────────────────── */
	.hero {
		display: grid;
		grid-template-columns: 1fr;
		gap: 2rem;
		padding: 3rem var(--page-gutter) 2.5rem;
		max-width: 1100px;
		margin: 0 auto;
	}

	@media (min-width: 768px) {
		.hero {
			grid-template-columns: 1fr 1fr;
			align-items: center;
			padding-top: 4rem;
			padding-bottom: 3.5rem;
		}
	}

	.hero-eyebrow {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-accent);
		margin-bottom: 0.6rem;
	}

	.hero-title {
		font-family: var(--font-display);
		font-size: clamp(2.4rem, 7vw, 4rem);
		font-weight: 700;
		letter-spacing: 0.05em;
		line-height: 1.1;
		color: var(--text);
		margin-bottom: 1rem;
	}

	.hero-subtitle {
		font-family: var(--font-body);
		font-size: clamp(1rem, 2.5vw, 1.2rem);
		line-height: 1.65;
		color: var(--text-muted);
		margin-bottom: 2rem;
		max-width: 44ch;
	}

	.hero-cta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}

	.hero-image-wrap {
		border-radius: 10px;
		overflow: hidden;
		box-shadow: 0 12px 48px rgba(0, 0, 0, 0.45);
		border: 1px solid var(--border-mid);
	}

	.hero-image {
		display: block;
		width: 100%;
		height: auto;
	}

	/* ── Shared section chrome ─────────────────────────────────────── */
	.about-section,
	.features-section,
	.systems-section {
		padding: 3rem var(--page-gutter);
		border-top: 1px solid var(--border);
	}

	.about-section-inner,
	.features-section-inner,
	.systems-section-inner {
		max-width: 1100px;
		margin: 0 auto;
	}

	.section-heading {
		font-family: var(--font-display);
		font-size: clamp(1.2rem, 3.5vw, 1.7rem);
		font-weight: 700;
		letter-spacing: 0.05em;
		color: var(--text-accent);
		margin-bottom: 1.5rem;
	}

	/* ── About prose ───────────────────────────────────────────────── */
	.about-prose {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 68ch;
	}

	.about-prose p {
		font-family: var(--font-body);
		font-size: 1.05rem;
		line-height: 1.75;
		color: var(--text-muted);
	}

	.about-prose strong {
		color: var(--text);
		font-weight: 600;
	}

	.about-prose em {
		color: var(--text-accent);
		font-style: italic;
	}

	/* ── Feature grid ──────────────────────────────────────────────── */
	.feature-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1rem;
	}

	@media (min-width: 600px) {
		.feature-grid { grid-template-columns: repeat(2, 1fr); }
	}

	@media (min-width: 960px) {
		.feature-grid { grid-template-columns: repeat(3, 1fr); }
	}

	.feature-card {
		padding: 1.4rem 1.2rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		transition: border-color 0.15s, box-shadow 0.15s;
	}

	.feature-card:hover {
		border-color: var(--border-mid);
		box-shadow: 0 4px 18px rgba(0, 0, 0, 0.2);
	}

	.feature-icon {
		display: flex;
		align-items: center;
		width: 32px;
		height: 32px;
		flex-shrink: 0;
	}

	.feature-icon :global(svg) {
		width: 28px;
		height: 28px;
		fill: currentColor;
	}

	.feature-title {
		font-family: var(--font-display);
		font-size: 0.95rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		color: var(--text);
	}

	.feature-body {
		font-family: var(--font-body);
		font-size: 0.95rem;
		line-height: 1.65;
		color: var(--text-muted);
		flex: 1;
	}

	/* ── Systems ───────────────────────────────────────────────────── */
	.systems-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}

	.system-badge {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.9rem;
		border: 1px solid var(--border-mid);
		border-radius: 20px;
		background: var(--bg-card);
		font-family: var(--font-ui);
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.03em;
		color: var(--text);
	}

	.system-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.systems-note {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		color: var(--text-dimmer);
		line-height: 1.6;
		max-width: 60ch;
	}

	/* ── Open Source ──────────────────────────────────────────────── */
	.opensource-section {
		padding: 3rem var(--page-gutter);
		border-top: 1px solid var(--border);
	}

	.opensource-inner {
		max-width: 1100px;
		margin: 0 auto;
	}

	.opensource-text p {
		font-family: var(--font-body);
		font-size: 1.05rem;
		line-height: 1.75;
		color: var(--text-muted);
		max-width: 68ch;
		margin-bottom: 1.25rem;
	}

	.github-link {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		border: 1px solid var(--border-mid);
		border-radius: 5px;
		background: var(--bg-card);
		font-family: var(--font-ui);
		font-size: 0.82rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--text);
		text-decoration: none;
		transition: border-color 0.15s, background 0.15s, color 0.15s;
	}

	.github-link:hover {
		border-color: var(--text-accent);
		background: var(--bg-hover);
		color: var(--text-accent);
		text-decoration: none;
		filter: none;
	}

	.github-link-icon {
		display: flex;
		align-items: center;
		flex-shrink: 0;
	}

	.github-link-icon :global(svg) {
		width: 18px;
		height: 18px;
		fill: currentColor;
	}

	/* ── CTA ───────────────────────────────────────────────────────── */
	.cta-section {
		padding: 3.5rem var(--page-gutter);
		border-top: 1px solid var(--border);
		background: var(--accent-dim);
	}

	.cta-inner {
		max-width: 1100px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 1rem;
	}

	.cta-title {
		font-family: var(--font-display);
		font-size: clamp(1.4rem, 4vw, 2.2rem);
		font-weight: 700;
		letter-spacing: 0.05em;
		color: var(--text-accent);
	}

	.cta-body {
		font-family: var(--font-body);
		font-size: 1.05rem;
		color: var(--text-muted);
		max-width: 44ch;
	}

	.cta-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		justify-content: center;
		margin-top: 0.5rem;
	}

	/* ── Large button variant ──────────────────────────────────────── */
	:global(.btn-lg) {
		padding: 8px 22px;
		font-size: 0.8rem;
	}

	/* ── Footer ────────────────────────────────────────────────────── */
	.about-footer {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0.5rem 0.75rem;
		padding: 1.5rem var(--page-gutter);
		border-top: 1px solid var(--border);
		font-family: var(--font-ui);
		font-size: 0.75rem;
		color: var(--text-dimmer);
	}

	.about-footer-brand {
		display: flex;
		align-items: center;
		gap: 5px;
		font-family: var(--font-display);
		font-size: 0.8rem;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.about-footer-brand :global(svg) {
		width: 12px;
		height: 12px;
		fill: var(--color-mana);
	}

	.about-footer-sep {
		color: var(--border-mid);
		user-select: none;
	}

	.about-footer-github {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
	}

	.about-footer-github :global(svg) {
		width: 12px;
		height: 12px;
		fill: currentColor;
		vertical-align: middle;
	}
</style>
