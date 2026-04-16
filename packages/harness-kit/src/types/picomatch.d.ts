declare module 'picomatch' {
	const picomatch: (pattern: string) => (value: string) => boolean;
	export default picomatch;
}
