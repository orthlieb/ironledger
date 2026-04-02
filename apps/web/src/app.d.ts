// See https://svelte.dev/docs/kit/types#app.d.ts

declare global {
	// Build-time constants injected by Vite (see vite.config.ts → define)
	const __APP_VERSION__: string;
	const __BUILD_DATE__: string;

	namespace App {
		interface Locals {
			user: { id: string; email: string; role: string } | null;
			accessToken: string | null;
		}
		interface PageData {
			user?: { id: string; email: string; role: string } | null;
		}
		interface Error {
			message: string;
		}
	}
}

export {};
