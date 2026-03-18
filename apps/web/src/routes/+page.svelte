<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	onMount(() => {
		void goto('/home');
	});
</script>

<!-- Redirecting to /home via onMount for CSR.
     The server-side redirect is handled in +page.server.ts. -->
<p style="color: var(--text-muted); padding: 2rem;">Redirecting…</p>
