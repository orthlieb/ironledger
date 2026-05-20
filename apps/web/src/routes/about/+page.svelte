<script lang="ts">
	import charactersSvg    from '$icons/Characters.svg?raw';
	import foesSvg          from '$icons/Foes.svg?raw';
	import expeditionsSvg   from '$icons/Expeditions.svg?raw';
	import adventureSvg     from '$icons/Adventure.svg?raw';
	import eyeSvg           from '$icons/eye-solid.svg?raw';
	import noteSvg          from '$icons/note-sticky-solid.svg?raw';
	import villageSvg       from '$icons/village.svg?raw';
	import mobileSvg        from '$icons/mobile-screen-solid.svg?raw';

	let { data }: { data: { user?: { name?: string } } } = $props();

	const features = [
		{
			icon: charactersSvg,
			title: 'Character Sheets',
			body: 'Stats, vows, bonds, debilities, XP — everything the Ironlands will hurl at you, and everything you\'ll cling to when the dice betray you. Auto-saved, because the darkness waits for no one.',
			color: 'var(--color-edge)',
		},
		{
			icon: foesSvg,
			title: 'Foe Tracker',
			body: '60+ horrors catalogued for your convenience. Know your enemy before it knows you. (Spoiler: it probably already does.) Track combat progress, mark the fallen, and try not to think about what comes next.',
			color: 'var(--color-heart)',
		},
		{
			icon: expeditionsSvg,
			title: 'Expeditions',
			body: 'The road goes ever on. Track journeys and delves so you remember which haunted barrow nearly claimed you last session. Themes, domains, denizens, progress tracks — all the grim details, preserved.',
			color: 'var(--color-iron)',
		},
		{
			icon: adventureSvg,
			title: 'Moves & Dice',
			body: '48 moves. Animated 3D dice. Strong hits are celebrated. Weak hits are… managed. Misses are logged, linked, and filed under "character development." The oracle sees all.',
			color: 'var(--color-shadow)',
		},
		{
			icon: eyeSvg,
			title: 'Oracles',
			body: '49 tables of fate spanning Core Ironsworn, Delve, and the Yrt homebrew expansion. Roll a d100, receive your destiny, and accept what the oracle decrees. It is what it is. Pay the price.',
			color: 'var(--color-wits)',
		},
		{
			icon: noteSvg,
			title: 'Session Log & Notes',
			body: 'Because "I think I swore a vow to avenge the blacksmith" is not a strategy. Every move, roll, and resource shift is captured automatically. Add freeform notes so your saga survives contact with real life.',
			color: 'var(--color-momentum)',
		},
		{
			icon: villageSvg,
			title: 'Communities & NPCs',
			body: 'The Ironlands are not empty. Track the settlements you\'ve found, the people you\'ve met, and the ones who owe you a favour. Oracle-powered random generation for names and locations — or build them by hand, if you\'re that kind of hero.',
			color: 'var(--color-health)',
		},
		{
			icon: mobileSvg,
			title: 'Plays on Your Phone',
			body: 'Swipe between tabs, drag the Adventure split to give the session log more room, see what just happened without losing your place. The Ironlands travel with you — on the couch, on the bus, anywhere your GM can reach you with texts about the next session.',
			color: 'var(--color-supply)',
		},
	];
</script>

<svelte:head>
	<title>Iron Ledger</title>
	<meta name="description" content="Iron Ledger is a digital companion app for Ironsworn — manage characters, foes, expeditions, moves, oracles, and session logs in one place." />
</svelte:head>


<!-- ── Hero ───────────────────────────────────────────────────────── -->
<section class="hero">
	<div class="hero-text">
		<p class="hero-eyebrow">Forged in JavaScript. Tempered by coffee.</p>
		<h1 class="hero-title">Iron Ledger</h1>
		<p class="hero-subtitle">
			The Ironlands are brutal, the dice are fickle, and paper character sheets have a way of disappearing right before a climactic vow. Iron Ledger remembers so you don't have to.
		</p>
	</div>
	<div class="hero-image-wrap">
		<img
			src="/ironledger-login.webp"
			alt="A lone Norse warrior stands before the iron-banded doors of a great mead hall"
			class="hero-image"
		/>
	</div>
	<div class="hero-cta">
		{#if data.user}
			<a href="/home"     class="btn btn-primary btn-lg">Continue Your Journey</a>
		{:else}
			<a href="/register" class="btn btn-primary btn-lg">Begin Your Journey</a>
			<a href="/login"    class="btn btn-lg">Sign In</a>
		{/if}
	</div>
</section>

<!-- ── What is Iron Ledger ────────────────────────────────────────── -->
<section class="about-section">
	<div class="about-section-inner">
		<h2 class="section-heading">What is Iron Ledger?</h2>
		<div class="about-layout">
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
			<div class="about-mobile-wrap">
				<img
					src="/ironledger-mobile.webp"
					alt="Iron Ledger running on a phone — character sheet with stats, resources, and adventure-action buttons within thumb reach"
					class="about-mobile"
				/>
			</div>
		</div>
	</div>
</section>

<!-- ── Features ──────────────────────────────────────────────────── -->
<section class="features-section">
	<div class="features-section-inner">
		<h2 class="section-heading">Everything You Need at the Table (Except Luck)</h2>
		<div class="feature-grid">
			{#each features as feat}
				<div class="feature-card" style="--feat-color: {feat.color}">
					<div class="feature-icon">
						{@html feat.icon}
					</div>
					<h3 class="feature-title">{feat.title}</h3>
					<p class="feature-body">{feat.body}</p>
				</div>
			{/each}
		</div>
	</div>
</section>

<!-- ── App preview ────────────────────────────────────────────────── -->
<section class="preview-section">
	<div class="preview-section-inner">
		<h2 class="section-heading">The Saga at a Glance</h2>
		<p class="preview-caption">
			Everything on one screen. Characters, foes, expeditions, communities, and your session
			log — always visible, never buried in a menu.
		</p>
		<div class="preview-image-wrap">
			<img
				src="/ironledger-home.webp"
				alt="Iron Ledger home screen showing the deck-of-cards layout with character sheet, foes, expeditions, communities, and session log panels"
				class="preview-image"
			/>
		</div>
	</div>
</section>

<!-- ── Open Source ───────────────────────────────────────────────── -->
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
			or Ironsworn.
		</p>
		<p class="systems-note systems-note--attribution">
			This work is based on <a href="https://ironswornrpg.com" target="_blank" rel="noopener noreferrer">Ironsworn</a>
			and <a href="https://ironswornrpg.com" target="_blank" rel="noopener noreferrer">Ironsworn: Delve</a>,
			created by Shawn Tomkin, and licensed for use under the
			<a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-NC-SA 4.0</a>
			license. Game data sourced from
			<a href="https://github.com/rsek/datasworn" target="_blank" rel="noopener noreferrer">Datasworn</a>
			by rsek.
			Icons by <a href="https://game-icons.net" target="_blank" rel="noopener noreferrer">game-icons.net</a>
			&amp; <a href="https://fontawesome.com" target="_blank" rel="noopener noreferrer">Font Awesome</a>.
			Iron Ledger is free and open source — source available on
			<a href="https://github.com/orthlieb/ironledger" target="_blank" rel="noopener noreferrer">GitHub</a>.
		</p>
	</div>
</section>

<style>
	/* ── Hero ──────────────────────────────────────────────────────── */
	.hero {
		display: grid;
		grid-template-columns: 1fr;
		gap: 2rem;
		padding: 0.75rem var(--page-gutter) 2.5rem;
		max-width: 1100px;
		margin: 0 auto;
	}

	@media (min-width: 768px) {
		.hero {
			grid-template-columns: 1fr 1fr;
			align-items: center;
			padding-top: 1rem;
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
		margin-bottom: 0;
		max-width: 100%;
	}

	.hero-cta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		grid-column: 1 / -1;
		justify-content: center;
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
	.about-layout {
		display: grid;
		grid-template-columns: 1fr;
		gap: 2rem;
		align-items: start;
	}

	@media (min-width: 768px) {
		.about-layout {
			grid-template-columns: minmax(0, 68ch) 260px;
			justify-content: center;
			gap: 2.5rem;
		}
	}

	.about-mobile-wrap {
		border-radius: 28px;
		overflow: hidden;
		box-shadow: 0 12px 48px rgba(0, 0, 0, 0.45);
		border: 1px solid var(--border-mid);
		width: 100%;
		max-width: 260px;
		margin: 0 auto;
		justify-self: center;
	}

	.about-mobile {
		display: block;
		width: 100%;
		height: auto;
	}

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
		border: 1px solid color-mix(in srgb, var(--feat-color) 25%, transparent);
		border-radius: 6px;
		background: color-mix(in srgb, var(--feat-color) 6%, var(--bg-card));
		transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
	}

	.feature-card:hover {
		border-color: color-mix(in srgb, var(--feat-color) 45%, transparent);
		box-shadow: 0 4px 18px rgba(0, 0, 0, 0.2);
	}

	.feature-icon {
		display: flex;
		align-items: center;
		width: 32px;
		height: 32px;
		flex-shrink: 0;
		color: var(--feat-color);
	}

	.feature-icon :global(svg),
	.feature-icon :global(svg *) {
		width: 28px;
		height: 28px;
		fill: currentColor;
	}

	.feature-title {
		font-family: var(--font-display);
		font-size: calc(0.95rem * var(--font-display-scale));
		font-weight: 700;
		letter-spacing: 0.04em;
		color: var(--feat-color);
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
		max-width: 100%;
	}
	.systems-note + .systems-note { margin-top: 0.5rem; }
	.systems-note--attribution a {
		color: var(--text-muted);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.systems-note--attribution a:hover { color: var(--text-accent); }

	/* ── App preview ──────────────────────────────────────────────── */
	.preview-section {
		padding: 3rem var(--page-gutter);
		border-top: 1px solid var(--border);
	}

	.preview-section-inner {
		max-width: 1100px;
		margin: 0 auto;
	}

	.preview-caption {
		font-family: var(--font-body);
		font-size: 1.05rem;
		line-height: 1.65;
		color: var(--text-muted);
		max-width: 60ch;
		margin-bottom: 1.5rem;
	}

	.preview-image-wrap {
		border-radius: 10px;
		overflow: hidden;
		box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5);
		border: 1px solid var(--border-mid);
	}

	.preview-image {
		display: block;
		width: 100%;
		height: auto;
	}

	/* ── Open Source ──────────────────────────────────────────────── */
	/* ── Large button variant ──────────────────────────────────────── */
	:global(.btn-lg) {
		padding: 8px 22px;
		font-size: 0.8rem;
	}

</style>
