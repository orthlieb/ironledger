// See https://svelte.dev/docs/kit/types#app.d.ts

declare global {
	namespace App {
		interface Locals {
			user: { id: string; email: string } | null;
			accessToken: string | null;
		}
		interface PageData {
			user?: { id: string; email: string } | null;
		}
		interface Error {
			message: string;
		}
	}
}

export {};
