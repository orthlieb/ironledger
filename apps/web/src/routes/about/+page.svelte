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
	import angleLeftSvg from '$icons/angle-left-solid-full.svg?raw';
	import angleRightSvg from '$icons/angle-right-solid-full.svg?raw';
	import { headingText } from '$lib/fontStore.svelte.js';
	import emblaCarouselSvelte from 'embla-carousel-svelte';
	import Autoplay from 'embla-carousel-autoplay';
	import type { EmblaCarouselType, EmblaOptionsType } from 'embla-carousel';

	let { data }: { data: { user?: { name?: string } } } = $props();

	// Each card has an optional `image` (3:2 WebP served from /about/,
	// ideally 1200x800). When omitted, the card renders a tinted placeholder
	// panel with the feature's icon centred at large size — same 3:2 slot,
	// so dropping in a real image later is a one-line swap with no layout
	// shift. Real images live at `apps/web/static/about/<key>.webp` and
	// are referenced as `/about/<key>.webp`.
	const features: {
		icon: string;
		title: string;
		body: string;
		color: string;
		image?: string;
		alt?: string;
	}[] = [
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
			image: '/about/foes.webp',
			alt: 'A cornered warrior faces a monstrous foe by torchlight',
		},
		{
			icon: expeditionsSvg,
			title: 'Expeditions',
			body: 'The road goes ever on. Track journeys and delves so you remember which haunted barrow nearly claimed you last session. Themes, domains, denizens, progress tracks — all the grim details, preserved.',
			color: 'var(--color-iron)',
			image: '/about/expeditions.webp',
			alt: 'Travellers on a long road through wild country',
		},
		{
			icon: mapSvg,
			title: 'Campaign Maps',
			body: 'Drop your world on a grid, pin the places your saga touches, and never again wave vaguely at "somewhere north of the barrow." Multiple maps per campaign — regional, city, dungeon, the lot. Markers snap to the grid, rotate to face where the road turns, and link straight to the community, NPC, place, journey, or site they represent. Zoom, drag, colour, label. Export the whole atlas as a zip and bring your Ironlands with you.',
			color: 'var(--color-touched)',
			image: '/about/maps.webp',
			alt: 'A hand-drawn campaign map with pinned locations',
		},
		{
			icon: adventureSvg,
			title: 'Moves & Dice',
			body: '48 moves. Animated 3D dice. Strong hits are celebrated. Weak hits are… managed. Misses are logged, linked, and filed under "character development." The oracle sees all.',
			color: 'var(--color-shadow)',
			image: '/about/moves.webp',
			alt: 'The Enter the Fray combat move open in Iron Ledger, its strong-hit, weak-hit and miss outcomes listed as animated 3D dice tumble across the screen',
		},
		{
			icon: eyeSvg,
			title: 'Oracles',
			body: '49 tables of fate spanning Core Ironsworn, Delve, and the Yrt homebrew expansion. Roll a d100, receive your destiny, and accept what the oracle decrees. It is what it is. Pay the price.',
			color: 'var(--color-wits)',
			image: '/about/oracles.webp',
			alt: 'A seer casting rune stones on worn wood',
		},
		{
			icon: noteSvg,
			title: 'Session Log & Notes',
			body: 'Because "I think I swore a vow to avenge the blacksmith" is not a strategy. Every move, roll, and resource shift is captured automatically. Add freeform notes so your saga survives contact with real life.',
			color: 'var(--color-momentum)',
			image: '/about/log.webp',
			alt: 'A scribe writing in a leather-bound journal by candlelight',
		},
		{
			icon: penSvg,
			title: 'AI Storyteller',
			body: 'Pin a start ▲ and an end ▼ on any two log entries — everything between them is your section. Hand it to Claude, ChatGPT, or Gemini and get back grim, weighty prose worthy of the Ironlands — your catastrophic misses immortalised as saga. Bring your own API key, and edit the tale before you commit it to the log — even the machines need a second draft.',
			color: 'var(--color-mana)',
			image: '/about/ai-storyteller.webp',
			alt: 'A skald singing a saga to a firelit hall',
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
			image: '/about/mobile.webp',
			alt: 'Iron Ledger open on a phone resting on a wooden table beside a gauntlet and an old key, showing a character sheet with description and portrait',
		},
	];

	// ── Carousel — powered by Embla ─────────────────────────────────
	// Embla owns the sliding mechanism (transform, touch/drag inertia,
	// wheel gestures, resize). We keep the card / dot / arrow markup
	// and drive them from `selectedIndex`, which mirrors Embla's active
	// snap via `on('select')`. Autoplay is a plugin — 6 s cadence,
	// pauses on pointer-enter or focus-in and resumes on leave/blur;
	// manual nav (prev/next/dot) resets the timer via
	// `autoplay.reset()` so the next slide doesn't fire seconds after
	// the user just picked one.
	const emblaOptions: EmblaOptionsType = {
		loop: true,
		align: 'start',
		containScroll: 'trimSnaps',
	};
	const emblaPlugins = [
		Autoplay({
			delay: 6000,
			stopOnMouseEnter: true,
			stopOnFocusIn: true,
			stopOnInteraction: false, // resume after nav rather than latch off
		}),
	];

	let emblaApi = $state<EmblaCarouselType | undefined>();
	let selectedIndex = $state(0);

	function onEmblaInit(event: CustomEvent<EmblaCarouselType>) {
		emblaApi = event.detail;
		selectedIndex = emblaApi.selectedScrollSnap();
		emblaApi.on('select', () => {
			if (emblaApi) selectedIndex = emblaApi.selectedScrollSnap();
		});
	}

	function goTo(i: number) {
		emblaApi?.scrollTo(i);
		emblaApi?.plugins().autoplay?.reset();
	}
	function next() {
		emblaApi?.scrollNext();
		emblaApi?.plugins().autoplay?.reset();
	}
	function prev() {
		emblaApi?.scrollPrev();
		emblaApi?.plugins().autoplay?.reset();
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'ArrowLeft') {
			prev();
			e.preventDefault();
		} else if (e.key === 'ArrowRight') {
			next();
			e.preventDefault();
		}
	}

	// Track the vertical centre of the media (image / placeholder) relative
	// to the carousel wrapper so the prev/next arrows overlay the middle of
	// the image, not the middle of the whole card. On desktop the media
	// stretches to card height so the two happen to coincide; on the mobile
	// stacked layout the media sits at the top of the card and the plain
	// `top: 50%` would fall in the text zone below it.
	let carouselEl = $state<HTMLDivElement | undefined>();
	let mediaEl = $state<HTMLDivElement | undefined>();
	let mediaMidY = $state('50%');

	$effect(() => {
		if (!carouselEl || !mediaEl) return;
		const update = () => {
			if (!carouselEl || !mediaEl) return;
			const cRect = carouselEl.getBoundingClientRect();
			const mRect = mediaEl.getBoundingClientRect();
			const mid = mRect.top - cRect.top + mRect.height / 2;
			mediaMidY = `${Math.round(mid)}px`;
		};
		update();
		const ro = new ResizeObserver(update);
		ro.observe(carouselEl);
		ro.observe(mediaEl);
		return () => ro.disconnect();
	});
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
		</div>
	</div>
</section>

<!-- ── Features (rotating carousel) ──────────────────────────────── -->
<section class="features-section">
	<div class="features-section-inner">
		<h2 class="section-heading">{headingText('Everything You Need at the Table (Except Luck)')}</h2>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			bind:this={carouselEl}
			class="carousel"
			role="region"
			aria-roledescription="carousel"
			aria-label="Iron Ledger features"
			style="--media-mid-y: {mediaMidY}"
			onkeydown={onKey}
			tabindex="-1"
		>
			<div
				class="carousel-viewport"
				use:emblaCarouselSvelte={{ options: emblaOptions, plugins: emblaPlugins }}
				onemblaInit={onEmblaInit}
			>
				<div class="carousel-track" aria-live="polite">
					{#each features as feat, i}
						<div
							class="carousel-slide"
							role="group"
							aria-roledescription="slide"
							aria-label={`${i + 1} of ${features.length}`}
							aria-hidden={i !== selectedIndex}
						>
							<div class="feature-card" style="--feat-color: {feat.color}">
								<div class="feature-media" bind:this={mediaEl}>
									{#if feat.image}
										<img
											src={feat.image}
											alt={feat.alt ?? ''}
											loading={i === 0 ? 'eager' : 'lazy'}
											decoding="async"
										/>
									{:else}
										<div class="feature-media-placeholder" aria-hidden="true">
											<div class="feature-media-glyph">{@html feat.icon}</div>
											<div class="feature-media-label">
												{headingText(feat.title)}
											</div>
										</div>
									{/if}
								</div>
								<div class="feature-body-wrap">
									<div class="feature-icon">
										{@html feat.icon}
									</div>
									<h3 class="feature-title">{headingText(feat.title)}</h3>
									<p class="feature-body">{feat.body}</p>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Arrows + dots overlay the card; arrows fade in on hover. -->
			<button
				type="button"
				class="carousel-nav carousel-nav-prev"
				onclick={prev}
				aria-label="Previous feature">{@html angleLeftSvg}</button
			>
			<button
				type="button"
				class="carousel-nav carousel-nav-next"
				onclick={next}
				aria-label="Next feature">{@html angleRightSvg}</button
			>

			<div class="carousel-dots" role="tablist" aria-label="Choose a feature">
				{#each features as feat, i}
					<button
						type="button"
						class="carousel-dot"
						class:carousel-dot--active={i === selectedIndex}
						onclick={() => goTo(i)}
						role="tab"
						aria-selected={i === selectedIndex}
						aria-label={feat.title}
						style="--feat-color: {feat.color}"
					></button>
				{/each}
			</div>
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
			<a href="https://game-icons.net" target="_blank" rel="noopener noreferrer">game-icons.net</a>,
			<a href="https://fontawesome.com" target="_blank" rel="noopener noreferrer">Font Awesome</a>,
			<a href="https://thenounproject.com" target="_blank" rel="noopener noreferrer"
				>The Noun Project</a
			>, and
			<a href="https://www.patreon.com/c/caeora/home" target="_blank" rel="noopener noreferrer"
				>Caeora</a
			>. Iron Ledger is free and open source — source available on
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
		justify-items: center;
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
	/* Layout: a single relative-positioned wrapper — the viewport fills
	   the whole width; arrows and dots overlay the card via absolute
	   positioning. Arrows fade in on hover; dots sit permanently on the
	   card's bottom edge. Both live at 50 % opacity so they read as
	   controls without competing with the feature content. */
	.carousel {
		position: relative;
		outline: none;
	}

	/* Embla owns the viewport DOM (attaches the action) and drives the
	   transform on `.carousel-track` directly via rAF, so no CSS
	   transition is needed — one would fight Embla's frame-by-frame
	   updates during drag. */
	.carousel-viewport {
		overflow: hidden;
		border-radius: 6px;
	}
	.carousel-track {
		display: flex;
		width: 100%;
		touch-action: pan-y pinch-zoom;
	}
	.carousel-slide {
		flex: 0 0 100%;
		min-width: 0;
		/* Slides not on screen aren't focusable; screenreaders skip them
		   via aria-hidden on the slide element. */
	}

	/* Card = two-column split on desktop (image left, text right),
	   stacked on mobile (image top, text below). The media slot holds
	   a 3:2 image (or tinted placeholder) so real WebPs can drop in
	   without shifting layout. */
	.feature-card {
		display: grid;
		grid-template-columns: minmax(0, 42%) minmax(0, 1fr);
		gap: 1.4rem;
		align-items: stretch;
		/* Extra bottom padding reserves room for the dot pagination row,
		   which absolute-positions on top of the card. */
		padding: 1.4rem 1.6rem 2.2rem 1.4rem;
		min-height: 260px;
		border: 1px solid color-mix(in srgb, var(--feat-color) 30%, transparent);
		border-radius: 6px;
		background: color-mix(in srgb, var(--feat-color) 8%, var(--bg-card));
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.28);
	}

	@media (max-width: 720px) {
		.feature-card {
			grid-template-columns: minmax(0, 1fr);
			padding: 1.2rem 1.2rem 2.2rem;
			gap: 1rem;
		}
	}

	/* Media slot — locked 3:2 aspect ratio so image swaps don't shift. */
	.feature-media {
		aspect-ratio: 3 / 2;
		border-radius: 4px;
		overflow: hidden;
		background: color-mix(in srgb, var(--feat-color) 14%, var(--bg-inset));
		border: 1px solid color-mix(in srgb, var(--feat-color) 22%, transparent);
	}
	.feature-media img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	/* Placeholder — feature-tinted panel with the icon centred and the
	   feature name below it. Same visual footprint as the real image
	   slot, so dropping in a WebP is a no-shift swap. */
	.feature-media-placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.9rem;
		width: 100%;
		height: 100%;
		color: var(--feat-color);
		text-align: center;
		padding: 1rem;
	}
	.feature-media-glyph {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 96px;
		height: 96px;
		opacity: 0.85;
	}
	.feature-media-glyph :global(svg),
	.feature-media-glyph :global(svg *) {
		width: 88px;
		height: 88px;
		fill: currentColor;
	}
	.feature-media-label {
		font-family: var(--font-display);
		font-size: calc(0.72rem * var(--font-display-scale));
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		opacity: 0.55;
		max-width: 100%;
	}

	/* Text column */
	.feature-body-wrap {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		min-width: 0;
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

	/* Prev/next arrows — absolute-positioned pills overlaying the L/R
	   edges of the card. Hidden by default; the parent's :hover reveals
	   them at 50 % opacity. Individual arrow hover brightens to full so
	   the target is unambiguous once the cursor lands on it.
	   `pointer-events: none` while hidden so they can't accidentally
	   intercept clicks (or the pause :hover on the carousel wrapper). */
	.carousel-nav {
		position: absolute;
		/* `--media-mid-y` is set by a ResizeObserver in the script that
		   tracks the media element's vertical centre relative to the
		   carousel wrapper — so on mobile (stacked layout with a tall
		   card) the arrows still land on the image, not the text below.
		   Falls back to 50 % during the first paint before the effect
		   runs. */
		top: var(--media-mid-y, 50%);
		transform: translateY(-50%);
		z-index: 2;
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-card);
		border: 1px solid var(--border-mid);
		border-radius: 50%;
		color: var(--text);
		cursor: pointer;
		opacity: 0;
		pointer-events: none;
		transition:
			opacity 0.18s ease,
			background 0.12s,
			border-color 0.12s,
			color 0.12s;
	}
	.carousel-nav :global(svg) {
		width: 16px;
		height: 16px;
		fill: currentColor;
		display: block;
	}
	.carousel-nav :global(svg *) {
		fill: currentColor;
	}
	.carousel-nav-prev {
		left: 0.75rem;
	}
	.carousel-nav-next {
		right: 0.75rem;
	}
	.carousel:hover .carousel-nav,
	.carousel:focus-within .carousel-nav {
		opacity: 0.5;
		pointer-events: auto;
	}
	.carousel-nav:hover {
		opacity: 1 !important;
		background: var(--bg-hover);
		border-color: var(--text-accent);
		color: var(--text-accent);
	}
	.carousel-nav:focus-visible {
		opacity: 1 !important;
		outline: 2px solid var(--text-accent);
		outline-offset: 2px;
	}
	/* On touch-only devices there is no hover — always show arrows so
	   the user has a way to navigate. Still at 50 % opacity to match
	   the desktop rollover state. */
	@media (hover: none) {
		.carousel-nav {
			opacity: 0.5;
			pointer-events: auto;
		}
	}

	/* Dot pagination — absolute-positioned inside the card at the
	   bottom. Always 50 % opacity; active dot brightens to full via
	   the accent-fill. One dot per slide, colour legend for the ten
	   features. */
	.carousel-dots {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0.75rem;
		z-index: 2;
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.55rem;
		opacity: 0.5;
		pointer-events: none;
	}
	/* Re-enable clicks on the individual dots (the row itself is a
	   background overlay). */
	.carousel-dot {
		pointer-events: auto;
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
