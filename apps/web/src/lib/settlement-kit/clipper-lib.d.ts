// Minimal ambient declaration for clipper-lib (ships no types). The kit
// uses it untyped; render.js wraps every call.
declare module 'clipper-lib' {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const ClipperLib: any;
	export default ClipperLib;
}
