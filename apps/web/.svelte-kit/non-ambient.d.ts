
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	export interface AppTypes {
		RouteId(): "/" | "/api" | "/api/auth" | "/api/auth/logout" | "/api/characters" | "/api/characters/[id]" | "/characters" | "/characters/[id]" | "/login" | "/logout";
		RouteParams(): {
			"/api/characters/[id]": { id: string };
			"/characters/[id]": { id: string }
		};
		LayoutParams(): {
			"/": { id?: string };
			"/api": { id?: string };
			"/api/auth": Record<string, never>;
			"/api/auth/logout": Record<string, never>;
			"/api/characters": { id?: string };
			"/api/characters/[id]": { id: string };
			"/characters": { id?: string };
			"/characters/[id]": { id: string };
			"/login": Record<string, never>;
			"/logout": Record<string, never>
		};
		Pathname(): "/" | "/api/auth/logout" | "/api/characters" | `/api/characters/${string}` & {} | "/characters" | `/characters/${string}` & {} | "/login" | "/logout";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/favicon.svg" | string & {};
	}
}