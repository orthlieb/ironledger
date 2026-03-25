<script lang="ts">
	import swordSvg         from '$icons/sharp-axe.svg?raw';
	import charactersSvg    from '$icons/Characters.svg?raw';
	import foesSvg          from '$icons/Foes.svg?raw';
	import expeditionsSvg   from '$icons/Expeditions.svg?raw';
	import adventureSvg     from '$icons/Adventure.svg?raw';
	import eyeSvg           from '$icons/eye-solid.svg?raw';
	import noteSvg          from '$icons/note-sticky-solid.svg?raw';

	let { data }: { data: { user?: { name?: string } } } = $props();

	const features = [
		{
			icon: charactersSvg,
			title: 'Character Sheets',
			body: 'Full Ironsworn character management — stats (Edge, Heart, Iron, Shadow, Wits), resources (Momentum, Health, Spirit, Supply), vows with progress tracks, bonds, failures, debilities, and XP. Auto-saved as you play.',
			color: 'var(--color-heart)',
		},
		{
			icon: foesSvg,
			title: 'Foe Tracker',
			body: 'Browse a catalogue of 60+ Ironsworn foes — beasts, undead, Ironlanders, and worse. Add encounters to your character, track combat progress, adjust rank and quantity, and mark foes vanquished.',
			color: 'var(--color-danger)',
		},
		{
			icon: expeditionsSvg,
			title: 'Expeditions',
			body: 'Track journeys across the Ironlands and delve into dangerous sites. Assign themes (Corrupted, Haunted, Wild…), domains (Barrow, Cavern, Ruin…), denizens, and progress tracks to each delve.',
			color: 'var(--color-supply)',
		},
		{
			icon: adventureSvg,
			title: 'Moves & Dice',
			body: 'Browse all 48 Ironsworn moves across 10 categories. Roll action and progress moves with animated 3D dice — strong hits, weak hits, and misses are logged with interactive outcome text.',
			color: 'var(--color-wits)',
		},
		{
			icon: eyeSvg,
			title: 'Oracles',
			body: '49 random result tables from Core Ironsworn, Ironsworn: Delve, and the Yrt homebrew expansion. Roll a d100, get your result, and have it added to the session log automatically.',
			color: 'var(--text-muted)',
		},
		{
			icon: noteSvg,
			title: 'Session Log & Notes',
			body: 'Every move, oracle roll, resource change, and vow update is captured in a persistent session log with clickable links. Add freeform notes to keep track of your story as it unfolds.',
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
		<p class="hero-eyebrow">Digital Companion for Ironsworn</p>
		<h1 class="hero-title">Iron Ledger</h1>
		<p class="hero-subtitle">
			Forge your saga. Track your oaths. Face the darkness — and remember every moment of the journey.
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
				<strong>Ironsworn</strong> is an award-winning solo and co-operative tabletop RPG by Shawn Tomkin,
				set in a dark, mythic land of iron and stone. You swear iron vows, face brutal foes, and carve out
				a legend against the odds — all with nothing but dice, imagination, and a few tables.
			</p>
			<p>
				<strong>Iron Ledger</strong> is a web-based companion app that handles everything else. No more
				hunting through rulebooks mid-session, no more paper sheets lost between sessions, no more
				forgotten oracle rolls. Your full chronicle lives here — always saved, always ready.
			</p>
			<p>
				Built specifically for Ironsworn (including the <em>Delve</em> supplement and the community
				<em>Yrt</em> homebrew), Iron Ledger stays true to the system's tone: dark, weighty, and precise.
			</p>
		</div>
	</div>
</section>

<!-- ── Features ──────────────────────────────────────────────────── -->
<section class="features-section">
	<div class="features-section-inner">
		<h2 class="section-heading">Everything You Need at the Table</h2>
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
			Iron Ledger is free to use. Create an account and bring your chronicle to life.
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
</style>
