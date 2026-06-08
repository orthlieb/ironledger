/**
 * Click-to-edit name behaviour shared across CharactersArea, FoesArea,
 * ExpeditionsArea, CommunitiesArea, and VowCard.
 *
 * Each stage header has its own visual styling (font, colour, layout),
 * so we don't extract the markup — we extract the state and handlers.
 *
 * Usage:
 *   const nameEdit = new EditableName((restored) => { d.name = restored; });
 *
 *   {#if nameEdit.editing}
 *     <input
 *       bind:this={nameEdit.inputEl}
 *       bind:value={d.name}
 *       onblur={nameEdit.commit}
 *       onkeydown={nameEdit.onKeydown}
 *     />
 *   {:else}
 *     <button onclick={() => nameEdit.start(d.name)} title="Click to rename">
 *       {d.name}
 *     </button>
 *   {/if}
 */
export class EditableName {
	editing = $state(false);
	inputEl = $state<HTMLInputElement | null>(null);
	#before = '';
	#restore: (originalValue: string) => void;

	/**
	 * @param restore  Called with the snapshot value when the user presses
	 *                 Escape — the parent must apply it to wherever the
	 *                 name actually lives (state store, character JSONB, etc.).
	 */
	constructor(restore: (originalValue: string) => void) {
		this.#restore = restore;
		$effect(() => {
			if (this.editing && this.inputEl) {
				this.inputEl.focus();
				this.inputEl.select();
			}
		});
		this.commit = this.commit.bind(this);
		this.cancel = this.cancel.bind(this);
		this.onKeydown = this.onKeydown.bind(this);
	}

	start(currentValue: string) {
		this.#before = currentValue;
		this.editing = true;
	}

	commit() {
		this.editing = false;
	}

	cancel() {
		this.#restore(this.#before);
		this.editing = false;
	}

	onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') this.inputEl?.blur();
		if (e.key === 'Escape') this.cancel();
	}
}
