<script lang="ts">
	import charactersSvg from '$icons/Characters.svg?raw';
	import foesSvg from '$icons/Foes.svg?raw';
	import expeditionsSvg from '$icons/Expeditions.svg?raw';
	import adventureSvg from '$icons/Adventure.svg?raw';
	import eyeSvg from '$icons/eye-solid.svg?raw';
	import noteSvg from '$icons/note-sticky-solid.svg?raw';
	import villageSvg from '$icons/village.svg?raw';
	import mobileSvg from '$icons/mobile-screen-solid.svg?raw';
	import penSvg from '$icons/pen-to-square-solid-full.svg?raw';
	import mapSvg from '$icons/treasure-map.svg?raw';
	import { headingText } from '$lib/fontStore.svelte.js';

	let { data }: { data: { user?: { name?: string } } } = $props();

	const features = [
		{
			icon: charactersSvg,
			title: 'Character Sheets',
			body: "Stats, vows, bonds, debilities, XP — everything the Ironlands will hurl at you, and everything you'll cling to when the dice betray you. Auto-saved, because the darkness waits for no one.",
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
			icon: mapSvg,
			title: 'Campaign Maps',
			body: 'Drop your world on a grid, pin the places your saga touches, and never again wave vaguely at "somewhere north of the barrow." Multiple maps per campaign — regional, city, dungeon, the lot. Markers snap to the grid, rotate to face where the road turns, and link straight to the community, NPC, place, journey, or site they represent. Zoom, drag, colour, label. Export the whole atlas as a zip and bring your Ironlands with you.',
			color: 'var(--color-touched)',
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
			icon: penSvg,
			title: 'AI Storyteller',
			body: 'Pin a start ▲ and an end ▼ on any two log entries — everything between them is your section. Hand it to Claude, ChatGPT, or Gemini and get back grim, weighty prose worthy of the Ironlands — your catastrophic misses immortalised as saga. Bring your own API key, and edit the tale before you commit it to the log — even the machines need a second draft.',
			color: 'var(--color-mana)',
		},
		{
			icon: villageSvg,
			title: 'Connections, NPCs & Places',
			body: "The Ironlands are not empty. Track the settlements you've found, the people you've met, the ones who owe you a favour, and the specific places that anchor your saga — an inn, a shrine, a ruin on the horizon. Oracle-powered random generation for names and locations — or build them by hand, if you're that kind of hero.",
			color: 'var(--color-health)',
		},
		{
			icon: mobileSvg,
			title: 'Plays on Your Phone',
			body: 'Swipe between tabs, drag the Adventure split to give the session log more room, see what just happened without losing your place. The Ironlands travel with you — on the couch, on the bus, anywhere your GM can reach you with texts about the next session.',
			color: 'var(--color-supply)',
		},
	];

	// ── Carousel state ──────────────────────────────────────────────
	// One card visible at a time; auto-advances every AUTO_MS. Pauses
	// while the pointer is over the carousel or when the user has
	// interacted with the controls (prev/next/dot) — resuming on
	// pointer leave. Reduced-motion users get the same rotation but
	// without the slide transition (CSS handles that).
	const AUTO_MS = 6000;
	let active = $state(0);
	let paused = $state(false);
	// Bumped by every user action so the auto-advance effect resets
	// its timer instead of firing immediately after a manual nav.
	let interactionTick = $state(0);

	function goTo(i: number) {
		const n = features.length;
		active = ((i % n) + n) % n;
		interactionTick++;
	}
	function next() {
		goTo(active + 1);
	}
	function prev() {
		goTo(active - 1);
	}

	$effect(() => {
		// Re-run whenever active/paused/interactionTick change so the
		// timer restarts from the current slide.
		void active;
		void interactionTick;
		if (paused) return;
		const id = setTimeout(() => {
			active = (active + 1) % features.length;
		}, AUTO_MS);
		return () => clearTimeout(id);
	});

	function onKey(e: KeyboardEvent) {
		if (e.key === 'ArrowLeft') {
			prev();
			e.preventDefault();
		} else if (e.key === 'ArrowRight') {
			next();
			e.preventDefault();
		}
	}
</script>

<svelte:head>
	<title>Iron Ledger</title>
	<meta
		name="description"
		content="Iron Ledger is a digital companion app for Ironsworn — manage characters, foes, expeditions, moves, oracles, session logs, and AI-written sagas in one place."
	/>
</svelte:head>

<!-- ── Hero ───────────────────────────────────────────────────────── -->
<section class="hero">
	<div class="hero-text">
		<p class="hero-eyebrow">Forged in JavaScript. Tempered by coffee.</p>
		<h1 class="hero-title">{headingText('Iron Ledger')}</h1>
		<p class="hero-subtitle">
			The Ironlands are brutal, the dice are fickle, and paper character sheets have a way of
			disappearing right before a climactic vow. Iron Ledger remembers so you don't have to.
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
			<a href="/home" class="btn btn-primary btn-lg">Continue Your Journey</a>
		{:else}
			<a href="/register" class="btn btn-primary btn-lg">Begin Your Journey</a>
			<a href="/login" class="btn btn-lg">Sign In</a>
		{/if}
	</div>
</section>

<!-- ── What is Iron Ledger ────────────────────────────────────────── -->
<section class="about-section">
	<div class="about-section-inner">
		<h2 class="section-heading">{headingText('What is Iron Ledger?')}</h2>
		<div class="about-layout">
			<div class="about-prose">
				<p>
					<strong>Ironsworn</strong> is an award-winning solo and co-operative tabletop RPG by Shawn Tomkin
					— a dark, mythic land of iron and stone where you swear oaths on pain of dishonour, face foes
					that would very much prefer you dead, and carve out a legend through nothing but dice, imagination,
					and an unreasonable willingness to suffer.
				</p>
				<p>
					<strong>Iron Ledger</strong> is the companion app that handles the clerical work while you handle
					the heroics. No more mid-session rulebook archaeology. No more paper sheets that vanish between
					sessions. No more "wait, did I mark that vow as Fulfilled or did I just think really hard about
					it?" Your full chronicle lives here — always saved, always accurate, always ready to witness
					your next catastrophic miss.
				</p>
				<p>
					Built for Ironsworn core, the <em>Delve</em> supplement, and the community <em>Yrt</em> homebrew
					expansion. Iron Ledger takes the game seriously, even when the dice clearly do not.
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

<!-- ── Features (rotating carousel) ──────────────────────────────── -->
<section class="features-section">
	<div class="features-section-inner">
		<h2 class="section-heading">{headingText('Everything You Need at the Table (Except Luck)')}</h2>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="carousel"
			role="region"
			aria-roledescription="carousel"
			aria-label="Iron Ledger features"
			onmouseenter={() => (paused = true)}
			onmouseleave={() => (paused = false)}
			onfocusin={() => (paused = true)}
			onfocusout={() => (paused = false)}
			onkeydown={onKey}
			tabindex="-1"
		>
			<button
				type="button"
				class="carousel-nav carousel-nav-prev"
				onclick={prev}
				aria-label="Previous feature">‹</button
			>

			<div class="carousel-viewport">
				<div
					class="carousel-track"
					style="transform: translateX(-{active * 100}%)"
					aria-live="polite"
				>
					{#each features as feat, i}
						<div
							class="carousel-slide"
							role="group"
							aria-roledescription="slide"
							aria-label={`${i + 1} of ${features.length}`}
							aria-hidden={i !== active}
						>
							<div class="feature-card" style="--feat-color: {feat.color}">
								<div class="feature-icon">
									{@html feat.icon}
								</div>
								<h3 class="feature-title">{headingText(feat.title)}</h3>
								<p class="feature-body">{feat.body}</p>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<button
				type="button"
				class="carousel-nav carousel-nav-next"
				onclick={next}
				aria-label="Next feature">›</button
			>
		</div>

		<div class="carousel-dots" role="tablist" aria-label="Choose a feature">
			{#each features as feat, i}
				<button
					type="button"
					class="carousel-dot"
					class:carousel-dot--active={i === active}
					onclick={() => goTo(i)}
					role="tab"
					aria-selected={i === active}
					aria-label={feat.title}
					style="--feat-color: {feat.color}"
				></button>
			{/each}
		</div>
	</div>
</section>

<!-- ── App preview ────────────────────────────────────────────────── -->
<section class="preview-section">
	<div class="preview-section-inner">
		<h2 class="section-heading">{headingText('The Saga at a Glance')}</h2>
		<p class="preview-caption">
			Everything on one screen. Characters, foes, expeditions, connections, and your session log —
			always visible, never buried in a menu.
		</p>
		<div class="preview-image-wrap">
			<img
				src="/ironledger-home.webp"
				alt="Iron Ledger home screen showing the deck-of-cards layout with character sheet, foes, expeditions, connections (communities, NPCs, and places), and session log panels"
				class="preview-image"
			/>
		</div>
	</div>
</section>

<!-- ── Open Source ───────────────────────────────────────────────── -->
<!-- ── Systems ────────────────────────────────────────────────────── -->
<section class="systems-section">
	<div class="systems-section-inner">
		<h2 class="section-heading">{headingText('Built for These Systems')}</h2>
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
			Iron Ledger is an independent fan project and is not affiliated with or endorsed by Shawn
			Tomkin or Ironsworn.
		</p>
		<p class="systems-note systems-note--attribution">
			This work is based on <a
				href="https://ironswornrpg.com"
				target="_blank"
				rel="noopener noreferrer">Ironsworn</a
			>
			and
			<a href="https://ironswornrpg.com" target="_blank" rel="noopener noreferrer"
				>Ironsworn: Delve</a
			>, created by Shawn Tomkin, and licensed for use under the
			<a
				href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
				target="_blank"
				rel="noopener noreferrer">CC BY-NC-SA 4.0</a
			>
			license. Game data sourced from
			<a href="https://github.com/rsek/datasworn" target="_blank" rel="noopener noreferrer"
				>Datasworn</a
			>
			by rsek. Icons by
			<a href="https://game-icons.net" target="_blank" rel="noopener noreferrer">game-icons.net</a>
			&amp;
			<a href="https://fontawesome.com" target="_blank" rel="noopener noreferrer">Font Awesome</a>.
			Iron Ledger is free and open source — source available on
			<a href="https://github.com/orthlieb/ironledger" target="_blank" rel="noopener noreferrer"
				>GitHub</a
			>.
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

	/* ── Feature carousel ──────────────────────────────────────────── */
	/* Layout: [ prev-arrow | viewport | next-arrow ] on a row, with
	   dots + progress underneath. Viewport clips a horizontally
	   translated track; each slide is 100% viewport width. */
	.carousel {
		display: flex;
		align-items: stretch;
		gap: 0.5rem;
		outline: none;
	}

	.carousel-viewport {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		border-radius: 6px;
	}

	.carousel-track {
		display: flex;
		width: 100%;
		will-change: transform;
		transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
	}

	@media (prefers-reduced-motion: reduce) {
		.carousel-track {
			transition: none;
		}
	}

	.carousel-slide {
		flex: 0 0 100%;
		min-width: 0;
		/* Slides not on screen aren't focusable; screenreaders skip them
		   via aria-hidden on the slide element. */
	}

	.feature-card {
		padding: 1.8rem 1.6rem;
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		min-height: 260px;
		border: 1px solid color-mix(in srgb, var(--feat-color) 30%, transparent);
		border-radius: 6px;
		background: color-mix(in srgb, var(--feat-color) 8%, var(--bg-card));
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.28);
	}

	.feature-icon {
		display: flex;
		align-items: center;
		width: 40px;
		height: 40px;
		flex-shrink: 0;
		color: var(--feat-color);
	}

	.feature-icon :global(svg),
	.feature-icon :global(svg *) {
		width: 36px;
		height: 36px;
		fill: currentColor;
	}

	.feature-title {
		font-family: var(--font-display);
		font-size: calc(1.15rem * var(--font-display-scale));
		font-weight: 700;
		letter-spacing: 0.05em;
		color: var(--feat-color);
	}

	.feature-body {
		font-family: var(--font-body);
		font-size: 1rem;
		line-height: 1.7;
		color: var(--text-muted);
		flex: 1;
	}

	/* Prev/next arrows — thin pill sitting next to the viewport. */
	.carousel-nav {
		flex-shrink: 0;
		width: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-card);
		border: 1px solid var(--border-mid);
		border-radius: 6px;
		color: var(--text-muted);
		font-family: var(--font-display);
		font-size: 1.6rem;
		line-height: 1;
		cursor: pointer;
		transition:
			background 0.12s,
			border-color 0.12s,
			color 0.12s;
	}
	.carousel-nav:hover {
		background: var(--bg-hover);
		border-color: var(--text-accent);
		color: var(--text-accent);
	}
	.carousel-nav:focus-visible {
		outline: 2px solid var(--text-accent);
		outline-offset: 2px;
	}

	/* Dot pagination row — one dot per slide, active dot fills with the
	   feature's accent so the row also reads as a colour legend. */
	.carousel-dots {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.55rem;
		margin-top: 1.1rem;
	}
	.carousel-dot {
		width: 10px;
		height: 10px;
		padding: 0;
		border: 1px solid var(--border-mid);
		background: transparent;
		border-radius: 50%;
		cursor: pointer;
		transition:
			background 0.15s,
			border-color 0.15s,
			transform 0.12s;
	}
	.carousel-dot:hover {
		border-color: var(--feat-color, var(--text-accent));
	}
	.carousel-dot:focus-visible {
		outline: 2px solid var(--text-accent);
		outline-offset: 2px;
	}
	.carousel-dot--active {
		background: var(--feat-color, var(--text-accent));
		border-color: var(--feat-color, var(--text-accent));
		transform: scale(1.15);
	}

	/* On narrow screens, drop the side arrows below the card so the
	   viewport spans full width. */
	@media (max-width: 560px) {
		.carousel {
			flex-wrap: wrap;
		}
		.carousel-viewport {
			flex-basis: 100%;
			order: -1;
		}
		.carousel-nav {
			flex: 1;
			height: 36px;
		}
		.feature-card {
			min-height: 320px;
			padding: 1.4rem 1.2rem;
		}
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
	.systems-note + .systems-note {
		margin-top: 0.5rem;
	}
	.systems-note--attribution a {
		color: var(--text-muted);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.systems-note--attribution a:hover {
		color: var(--text-accent);
	}

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
