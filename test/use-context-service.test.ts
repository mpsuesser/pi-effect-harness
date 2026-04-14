import { testPattern } from './pattern-test-harness.ts';

testPattern({
	name: 'use-context-service',

	shouldMatch: [
		'class MyService extends ServiceMap.Service<MyService>()("@app/MyService", {})',
		'export class Foo extends ServiceMap.Service<Foo>()("Foo") {}'
	],
	shouldNotMatch: [
		'class MyService extends Context.Service<MyService>()("@app/MyService", {})',
		'const tag = "ServiceMap.Service"',
		'// ServiceMap.Service was renamed in beta.46',
		'Context.Service'
	]
});
