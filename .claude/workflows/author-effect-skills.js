export const meta = {
	name: 'author-effect-skills',
	description:
		'Author 11 new Effect v4 skills from source with adversarial review and revision',
	phases: [
		{
			title: 'Author',
			detail:
				'one specialist per skill reads Effect source/tests and writes SKILL.md',
			model: 'fable'
		},
		{
			title: 'Review',
			detail:
				'per skill: adversarial accuracy reviewer + completeness/scope/style reviewer',
			model: 'fable'
		},
		{
			title: 'Revise',
			detail: 'independently verify and apply review findings',
			model: 'fable'
		},
		{
			title: 'Consistency',
			detail: 'cross-skill frontmatter and scope alignment',
			model: 'fable'
		}
	]
};

const ROOT = '/Users/m/.cache/effect-v4';
const SRC = ROOT + '/packages/effect/src';
const TEST = ROOT + '/packages/effect/test';
const PNODE = ROOT + '/packages/platform-node';
const RPC = SRC + '/unstable/rpc';
const HTTP = SRC + '/unstable/http';
const SOCK = SRC + '/unstable/socket';
const SKILLS_DIR = '/Users/m/repos/pi-effect-harness/harnesses/effect/skills';

const list = (xs) =>
	(xs && xs.length ? xs : ['(none)']).map((x) => '- ' + x).join('\n');

const SKILLS = [
	{
		name: 'effect-rpc-api',
		specialization:
			'defining type-safe RPC contracts with effect/unstable/rpc — Rpc.make, RpcGroup, payload/success/error schemas, streaming RPCs, and middleware definitions',
		scope:
			'Everything about DEFINING the shared RPC contract: Rpc.make and its options (payload, success, error and any other option keys found in source), tagged request schemas, RpcSchema.Stream for streaming results, RpcGroup.make and its combinators (merge, prefix, omit, annotate, annotateContext and whatever else the source exposes), middleware DEFINITION via RpcMiddleware (tags, provides/requirements, failure types, options such as optional, wrap, requiredForClient — verify exact names), derived error unions and exit schemas, Rpc.Wrapper and custom constructors if present, and how contracts are structured so client and server packages share them.',
		outOfScope:
			'Wiring servers and handlers (effect-rpc-server skill), constructing clients and protocols (effect-rpc-client skill), cluster entities and sharding (existing effect-rpc-cluster skill).',
		siblingNote:
			'Sibling skills effect-rpc-client and effect-rpc-server are being authored concurrently by other agents — cross-reference them by name where helpful, but do not read them (they may not exist yet). The existing effect-rpc-cluster skill contains an rpc overview plus cluster material: read it, then go substantially deeper on contract definition instead of repeating it.',
		sources: [
			RPC + '/Rpc.ts',
			RPC + '/RpcGroup.ts',
			RPC + '/RpcSchema.ts',
			RPC + '/RpcMiddleware.ts',
			RPC + '/RpcMessage.ts (wire-format awareness)',
			RPC + '/index.ts (public exports)'
		],
		tests: [
			TEST + '/rpc/Rpc.test.ts',
			TEST + '/rpc/RpcClient.test.ts (shows contracts used end-to-end)'
		],
		extras: [
			SKILLS_DIR +
			'/effect-rpc-cluster/SKILL.md (existing skill — read to avoid duplication and match terminology)'
		],
		adjacents: [
			SKILLS_DIR + '/effect-rpc-cluster/SKILL.md',
			SKILLS_DIR + '/effect-http-api/SKILL.md'
		]
	},
	{
		name: 'effect-rpc-client',
		specialization:
			'consuming RPC services with RpcClient — protocols (HTTP, WebSocket, worker, in-memory), serialization, headers, connection lifecycle, and client-side error handling',
		scope:
			'RpcClient.make and all its options (verify in source: flattening, span/tracing options, generics), the Protocol service and every layerProtocol* constructor, which RpcSerialization codecs (json, ndjson, msgpack, jsonRpc variants) pair with which protocols, per-call and ambient headers (withHeaders, CurrentHeaders), ConnectionHooks and reconnection behavior, consuming streaming RPCs on the client, interruption and abort propagation to the server, the RpcClientError taxonomy and handling strategies, RpcTest.makeClient for in-process testing, and worker transports via RpcWorker.',
		outOfScope:
			'Contract definition (effect-rpc-api skill), server wiring (effect-rpc-server skill), cluster (existing effect-rpc-cluster skill).',
		siblingNote:
			'Sibling skills effect-rpc-api and effect-rpc-server are being authored concurrently — cross-reference them by name only; do not read them. Read the existing effect-rpc-cluster skill to avoid duplicating its material.',
		sources: [
			RPC + '/RpcClient.ts',
			RPC + '/RpcClientError.ts',
			RPC + '/RpcSerialization.ts',
			RPC + '/RpcTest.ts',
			RPC + '/RpcWorker.ts',
			RPC + '/RpcMessage.ts'
		],
		tests: [
			TEST + '/rpc/RpcClient.test.ts',
			TEST + '/rpc/RpcSerialization.test.ts',
			PNODE +
			'/test/RpcServer.test.ts (client-server integration over real transports)'
		],
		extras: [
			SKILLS_DIR +
			'/effect-rpc-cluster/SKILL.md (existing skill — read to avoid duplication)'
		],
		adjacents: [
			SKILLS_DIR + '/effect-rpc-cluster/SKILL.md',
			SKILLS_DIR + '/effect-http-api/SKILL.md'
		]
	},
	{
		name: 'effect-rpc-server',
		specialization:
			'serving RPC groups with RpcServer — handler layers, protocol layers (HTTP, WebSocket, stdio, worker), serialization, middleware implementation, and HttpRouter integration',
		scope:
			'Implementing handlers with RpcGroup.toLayer / toLayerHandler / toHandlers / accessHandler (verify exact surface), RpcServer.make / layer and every layerProtocol* variant, embedding RPC into an existing HTTP server via the toHttpEffect-style helpers, choosing serialization layers, IMPLEMENTING middleware (providing RpcMiddleware services, ordering, failure behavior), streaming handler results, client-abort and interruption semantics on the server side, worker-based servers, testing servers with RpcTest, and graceful shutdown / disconnect handling.',
		outOfScope:
			'Contract definition (effect-rpc-api skill), client construction (effect-rpc-client skill), cluster entities/sharding (existing effect-rpc-cluster skill), HttpRouter fundamentals (effect-http-server skill).',
		siblingNote:
			'Sibling skills effect-rpc-api, effect-rpc-client and effect-http-server are being authored concurrently — cross-reference them by name only; do not read them. Read the existing effect-rpc-cluster skill to avoid duplicating its material.',
		sources: [
			RPC + '/RpcServer.ts',
			RPC + '/RpcGroup.ts (handler wiring)',
			RPC + '/RpcMiddleware.ts',
			RPC + '/RpcSerialization.ts',
			RPC + '/RpcWorker.ts'
		],
		tests: [
			PNODE + '/test/RpcServer.test.ts (the main integration suite)',
			TEST + '/rpc/RpcClient.test.ts'
		],
		extras: [
			SKILLS_DIR +
			'/effect-rpc-cluster/SKILL.md (existing skill — read to avoid duplication)'
		],
		adjacents: [
			SKILLS_DIR + '/effect-rpc-cluster/SKILL.md',
			SKILLS_DIR + '/effect-http-api/SKILL.md'
		]
	},
	{
		name: 'effect-cache',
		specialization:
			'in-memory caching with Cache and ScopedCache — capacity, time-to-live, lookup functions, invalidation, and resource-owning cache entries',
		scope:
			'Cache.make and its full option surface (capacity, lookup, timeToLive including any exit-aware TTL forms — verify in source), the complete method surface (get, refresh, invalidate variants, contains/size/whatever exists), concurrent-lookup deduplication semantics (simultaneous gets share one lookup), whether and how failed lookups are cached, ScopedCache for entries that own resources (acquireRelease inside lookup, finalizers run on eviction/invalidation), choosing Cache vs ScopedCache, and practical patterns: memoizing effectful lookups, per-key TTL, refresh-ahead, cache-as-service via Layer.',
		outOfScope:
			'Request/RequestResolver batching and request caching (existing effect-batching skill), Pool (mention as a pointer only), resource lifecycle fundamentals (effect-scope skill).',
		siblingNote:
			'Sibling skill effect-scope is being authored concurrently — reference it by name only; do not read it.',
		sources: [SRC + '/Cache.ts', SRC + '/ScopedCache.ts'],
		tests: [TEST + '/Cache.test.ts', TEST + '/ScopedCache.test.ts'],
		extras: [
			'(no extra topic-specific material — rely on source, JSDoc examples, and tests)'
		],
		adjacents: [SKILLS_DIR + '/effect-batching/SKILL.md']
	},
	{
		name: 'effect-fiber',
		specialization:
			'fiber lifecycle and supervision — forking, joining, interruption, and dynamic fiber collections (FiberHandle, FiberMap, FiberSet)',
		scope:
			'The v4 fiber model and structured concurrency (parent-child lifetimes, automatic interruption); every Effect.fork variant that exists in v4 source (verify exact names — fork, forkDaemon, forkIn, forkScoped, forkChild or whatever beta.80 actually exports) and their lifetime differences; Fiber operations (join, await, awaitAll, interrupt, interruptAll, poll — verify); reading Exit results; interruption semantics, uninterruptible regions, onInterrupt; FiberHandle for single-slot supervision (run, runtime helpers), FiberMap for keyed fibers, FiberSet for grow-only sets, including their await/join/clear semantics and what happens on scope close; runtime keep-alive behavior; supervision patterns: restart-on-crash, latest-wins cancellation, bounded background task sets.',
		outOfScope:
			'High-level declarative concurrency combinators like Effect.all / forEach / race (effect-parallelization skill, authored concurrently).',
		siblingNote:
			'Sibling skill effect-parallelization is being authored concurrently — reference it by name only and keep this skill centered on fiber lifecycle and supervision; do not read it.',
		sources: [
			SRC + '/Fiber.ts',
			SRC + '/FiberHandle.ts',
			SRC + '/FiberMap.ts',
			SRC + '/FiberSet.ts',
			SRC +
			'/Effect.ts (very large — grep for fork, interrupt, onInterrupt, uninterruptible sections instead of reading end-to-end)'
		],
		tests: [
			TEST + '/Fiber.test.ts',
			TEST + '/FiberHandle.test.ts',
			TEST + '/FiberMap.test.ts',
			TEST + '/FiberSet.test.ts',
			TEST + '/EffectKeepAlive.test.ts'
		],
		extras: [
			ROOT + '/ai-docs/src/01_effect (look for fiber/concurrency lessons)'
		],
		adjacents: [SKILLS_DIR + '/effect-concurrency-testing/SKILL.md']
	},
	{
		name: 'effect-scope',
		specialization:
			'resource lifecycle management with Scope — acquireRelease, finalizers, scoped effects, and scope ownership across layers and fibers',
		scope:
			'The Scope mental model (how Scope appears in R and is eliminated); Effect.acquireRelease and acquireUseRelease; Effect.addFinalizer and Exit-aware finalizers; onExit/ensuring and how they relate; Effect.scoped and any scopeWith/provideScope-style helpers that exist in v4 (verify exact surface in source); manual Scope.make / close / fork usage and when it is warranted; finalizer ordering and error behavior during close; extending or splitting scopes; how Layer owns scopes (Layer.scoped and friends — skim Layer.ts only as far as scope interplay); fibers and scopes (forkScoped/forkIn as pointers to effect-fiber); ScopedRef; patterns: file handles, connections, event-listener registration, test fixtures.',
		outOfScope:
			'Layer architecture and composition (existing effect-layer-design skill), fiber supervision (effect-fiber skill), ScopedCache (effect-cache skill).',
		siblingNote:
			'Sibling skills effect-fiber and effect-cache are being authored concurrently — reference them by name only; do not read them.',
		sources: [
			SRC + '/Scope.ts',
			SRC + '/ScopedRef.ts',
			SRC +
			'/Effect.ts (grep for acquireRelease, addFinalizer, onExit, ensuring, scoped, scope — do not read end-to-end)',
			SRC +
			'/Layer.ts (skim only the scoped constructors and scope ownership)'
		],
		tests: [TEST + '/Scope.test.ts', TEST + '/ScopedRef.test.ts'],
		extras: [
			ROOT +
			'/ai-docs/src/01_effect (look for resource-management lessons)'
		],
		adjacents: [
			SKILLS_DIR + '/effect-layer-design/SKILL.md',
			SKILLS_DIR + '/effect-managed-runtime/SKILL.md'
		]
	},
	{
		name: 'effect-http-server',
		specialization:
			'building HTTP servers with effect/unstable/http — HttpRouter, HttpServer, request/response handling, middleware, and platform layers',
		scope:
			'HttpRouter as found in v4 source (route registration, path params, mounting/prefixing — verify the actual API shape, it may be service-based); HttpServerRequest (headers, URL params, schema-validated body/params decoding, multipart uploads, cookies); HttpServerResponse constructors (text, json, schema-encoded json, html, stream, file, empty, redirects — whatever the source exports); HttpMiddleware (built-ins like logger/cors/tracing if present, writing custom middleware, ordering); websocket upgrades if exposed through the http server surface; HttpStaticServer; error handling (HttpServerError, HttpServerRespondable, mapping domain errors to responses); serving via NodeHttpServer.layer (mention the Bun equivalent); graceful shutdown; testing handlers in-memory without a real port (HttpEffect or whatever the source provides).',
		outOfScope:
			'The declarative HttpApi/OpenAPI layer (existing effect-http-api skill — point to it, never re-teach it), HTTP clients (effect-http-client skill), raw sockets (effect-socket skill).',
		siblingNote:
			'Sibling skills effect-http-client and effect-socket are being authored concurrently — reference them by name only; do not read them.',
		sources: [
			HTTP + '/HttpRouter.ts',
			HTTP + '/HttpServer.ts',
			HTTP + '/HttpServerRequest.ts',
			HTTP + '/HttpServerResponse.ts',
			HTTP + '/HttpMiddleware.ts',
			HTTP + '/HttpEffect.ts',
			HTTP + '/HttpServerError.ts',
			HTTP + '/HttpServerRespondable.ts',
			HTTP + '/HttpBody.ts',
			HTTP + '/Headers.ts',
			HTTP + '/Cookies.ts',
			HTTP + '/Multipart.ts',
			HTTP + '/HttpStaticServer.ts',
			PNODE + '/src/NodeHttpServer.ts'
		],
		tests: [
			TEST + '/unstable/http (directory — read the relevant suites)',
			PNODE + '/test/NodeHttpServer.test.ts',
			PNODE + '/test/HttpStaticServer.test.ts'
		],
		extras: [
			ROOT + '/ai-docs/src/51_http-server (runnable lessons)',
			SKILLS_DIR +
			'/effect-http-api/SKILL.md (existing skill that owns HttpApi — read to set the boundary, do not duplicate)'
		],
		adjacents: [
			SKILLS_DIR + '/effect-http-api/SKILL.md',
			SKILLS_DIR + '/effect-platform-layers/SKILL.md'
		]
	},
	{
		name: 'effect-http-client',
		specialization:
			'making HTTP requests with HttpClient — request construction, response handling, schema decoding, resilience, streaming, and platform layers',
		scope:
			'The HttpClient service and providing it (FetchHttpClient layer and options, NodeHttpClient — when each applies); HttpClientRequest builders (methods, URLs, UrlParams, headers, bearer/basic auth helpers if present, bodies: json, schema-encoded, urlencoded form, multipart, stream, file); HttpClientResponse accessors (schema-validated json body, text, arrayBuffer, stream, headers, cookies); the HttpClientError taxonomy and status handling (filterStatusOk and friends); client transformation combinators found in source (mapRequest, retry / retryTransient, timeout-style helpers, redirect following, tracer propagation, cookie jars — verify exact names); streaming uploads and downloads; testing by substituting the HttpClient layer or mocking responses.',
		outOfScope:
			'Serving HTTP (effect-http-server skill), the declarative HttpApi client derivation (existing effect-http-api skill).',
		siblingNote:
			'Sibling skill effect-http-server is being authored concurrently — reference it by name only; do not read it.',
		sources: [
			HTTP + '/HttpClient.ts',
			HTTP + '/HttpClientRequest.ts',
			HTTP + '/HttpClientResponse.ts',
			HTTP + '/HttpClientError.ts',
			HTTP + '/FetchHttpClient.ts',
			HTTP + '/UrlParams.ts',
			HTTP + '/Url.ts',
			HTTP + '/Cookies.ts',
			HTTP + '/HttpBody.ts',
			PNODE + '/src/NodeHttpClient.ts'
		],
		tests: [
			TEST + '/HttpClient.test.ts',
			PNODE + '/test/NodeHttpClient.test.ts'
		],
		extras: [ROOT + '/ai-docs/src/50_http-client (runnable lessons)'],
		adjacents: [SKILLS_DIR + '/effect-http-api/SKILL.md']
	},
	{
		name: 'effect-socket',
		specialization:
			'raw socket and WebSocket programming with effect/unstable/socket — the Socket abstraction, SocketServer, and platform implementations',
		scope:
			'The Socket abstraction as defined in v4 source (how data flows in and out — run/writer/channel surface, verify exactly); constructing WebSocket-backed sockets (browser and server side — verify the actual constructors and layers in Socket.ts); TCP and Unix-domain sockets via NodeSocket; accepting connections with SocketServer and NodeSocketServer (mention Bun equivalents — check packages/platform-bun/src); the SocketError taxonomy (open/read/write/close kinds); framing and transforming socket traffic with Stream/Channel (NDJSON over a socket as a pattern); reconnect/retry patterns; sockets as transports for higher layers (one-line pointers to the rpc skills); testing with in-memory or loopback sockets as the tests demonstrate.',
		outOfScope:
			'HTTP serving (effect-http-server skill), RPC protocol details (effect-rpc-client / effect-rpc-server skills), cluster runners (existing effect-rpc-cluster skill).',
		siblingNote:
			'Sibling skills effect-http-server, effect-rpc-client and effect-rpc-server are being authored concurrently — reference them by name only; do not read them.',
		sources: [
			SOCK + '/Socket.ts',
			SOCK + '/SocketServer.ts',
			PNODE + '/src/NodeSocket.ts',
			PNODE + '/src/NodeSocketServer.ts'
		],
		tests: [PNODE + '/test/NodeSocket.test.ts'],
		extras: [
			ROOT +
			'/packages/platform-bun/src (check for Bun socket equivalents)'
		],
		adjacents: [SKILLS_DIR + '/effect-rpc-cluster/SKILL.md']
	},
	{
		name: 'effect-parallelization',
		specialization:
			'concurrent and parallel execution — Effect.all, forEach, racing, fan-out, and coordination primitives (Semaphore, PartitionedSemaphore, Latch)',
		scope:
			'The concurrency option and its exact semantics (numeric, unbounded, inherit — verify in source/Types.ts); Effect.all across tuples, arrays, records and iterables including its options (concurrency, discard, mode if present — verify); Effect.forEach and friends; racing (race, raceAll, and any raceFirst-style variants that exist) including loser interruption; concurrent zips; concurrent filtering/partitioning helpers that exist in v4; structured-concurrency guarantees (children interrupted when the parent finishes or fails); Semaphore (withPermits, take/release, fairness), PartitionedSemaphore for keyed concurrency limits, Latch for gating (open, close, await, whenOpen-style helpers — verify); patterns: bounded fan-out over a work list, first-success-wins, throttled batch processing, coordinating startup with latches. Point to effect-fiber for manual fiber control and to effect-stream for streaming pipelines.',
		outOfScope:
			'Fiber lifecycle and supervision primitives (effect-fiber skill, authored concurrently), Stream-based pipelines (existing effect-stream skill), STM/Tx structures.',
		siblingNote:
			'Sibling skill effect-fiber is being authored concurrently — reference it by name only and keep this skill centered on declarative combinators and coordination primitives; do not read it.',
		sources: [
			SRC +
			'/Effect.ts (very large — grep for: export const all, forEach, race, Concurrency; read those sections and their JSDoc)',
			SRC + '/Semaphore.ts',
			SRC + '/PartitionedSemaphore.ts',
			SRC + '/Latch.ts',
			SRC + '/Types.ts (the Concurrency type)'
		],
		tests: [
			TEST + '/Effect.test.ts (concurrency-related describe blocks)',
			TEST + '/Semaphore.test.ts',
			TEST + '/PartitionedSemaphore.test.ts',
			TEST + '/Latch.test.ts'
		],
		extras: [
			ROOT + '/ai-docs/src/01_effect (look for concurrency lessons)'
		],
		adjacents: [
			SKILLS_DIR + '/effect-concurrency-testing/SKILL.md',
			SKILLS_DIR + '/effect-stream/SKILL.md'
		]
	},
	{
		name: 'effect-graph',
		specialization:
			'the Graph module — building, querying, traversing, and running algorithms over immutable graphs',
		scope:
			'Whatever packages/effect/src/Graph.ts actually provides at beta.80 — read the entire module and its full export list first, then cover the real surface: graph construction (directed/undirected variants as they exist), the mutation/builder API, node and edge handles/indices, adding/removing/updating nodes and edges, queries (neighbors, degrees, edge lookup), traversals and iterators (DFS/BFS/topological order — only what exists), algorithms shipped in the module (cycle detection, strongly connected components, shortest paths — only what exists, with exact names), Equal/Hash/inspection integration, and practical patterns: dependency graphs, task ordering, reachability analysis.',
		outOfScope:
			'Anything not in the Graph module itself; do not invent algorithms the module does not ship.',
		siblingNote: '',
		sources: [
			SRC + '/Graph.ts (read fully — the module is self-contained)'
		],
		tests: [TEST + '/Graph.test.ts'],
		extras: [
			'(no extra topic-specific material — rely on source, JSDoc examples, and tests)'
		],
		adjacents: []
	}
];

const authorPrompt = (s) =>
	`You are authoring a new AI-agent skill file for an Effect v4 TypeScript harness. You are a specialist in ${s.specialization}. Work autonomously end-to-end; do not ask questions.

GOAL
Create the file ${SKILLS_DIR}/${s.name}/SKILL.md — a dense, comprehensive, high-signal skill that teaches an AI coding agent to use this part of Effect v4 correctly. The user loads these skills as a staple across all their projects; optimize for correctness and signal density above all.

SOURCE OF TRUTH
The Effect v4 monorepo (package version 4.0.0-beta.80) is cloned at ${ROOT}. Effect v4 differs substantially from Effect v3 and from your training data. Never write an API from memory: verify every export name, signature, option key, default, and behavioral claim by reading the source. JSDoc comments in the source files contain excellent, accurate examples — mine them. Use grep to navigate very large files instead of reading them end-to-end.

READ FIRST — style exemplars (read at least the first two in full):
- ${SKILLS_DIR}/effect-stream/SKILL.md
- ${SKILLS_DIR}/effect-rpc-cluster/SKILL.md
- ${SKILLS_DIR}/effect-batching/SKILL.md

PRIMARY SOURCES (read comprehensively):
${list(s.sources)}

TESTS (real usage and edge-case semantics — read these):
${list(s.tests)}

ALSO CONSULT:
${list(s.extras)}
- ${ROOT}/MIGRATION.md — v3 to v4 changes; mine it for Common Mistakes entries relevant to your topic
- ${ROOT}/ai-docs/index.md — index of runnable lessons under ai-docs/src/
- The module index files and ${ROOT}/packages/effect/package.json exports to confirm public import subpaths

SCOPE
${s.scope}

OUT OF SCOPE
${s.outOfScope}
${s.siblingNote}
Where your topic borders an adjacent skill, add a one-line pointer (for example: see the effect-http-api skill) instead of covering it.

FORMAT — match the exemplars:
1. YAML frontmatter delimited by --- lines with exactly two keys: name (${s.name}) and description. The description is one line: starts with an imperative verb, names the key modules/APIs, and ends with a sentence beginning with Use when, listing concrete trigger situations an agent would recognize.
2. Opening line of the body: You are an Effect TypeScript expert specializing in ...
3. A section titled Effect Source Reference (H2): states the Effect v4 source is at ~/.cache/effect-v4/ and should be read directly when in doubt, then bullets the key source files (repo-relative paths) with a few words on what each contains.
4. A core mental-model section: the central type signature(s), how to think about them, and the import statements used throughout the skill.
5. Numbered H2 sections that progress from defining/creating, through everyday use, to advanced topics and integration.
6. An H2 section titled Key Patterns near the end: realistic end-to-end snippets that combine the APIs the way production code does.
7. The final H2 section titled Common Mistakes: a numbered list of sharp, specific gotchas — v3 habits that no longer compile, thunk-vs-value arguments, wrong option key names, surprising defaults or behaviors. Each entry one or two lines, concrete, with the correct alternative.

CODE STYLE IN EXAMPLES
- TypeScript fenced code blocks, tab indentation, single quotes, semicolons (exactly like the exemplars).
- Show import lines; verify import subpaths (for example effect/unstable/http) against the package exports before using them.
- Every snippet must be type-correct against the beta.80 source: exact API names, exact option keys, correct argument order, correct dual (data-first/data-last) usage. When an options object exists, show its real keys.
- Note version-specific behavior where the source or recent git history reveals it (read-only git log / git show in ${ROOT} is allowed).

LENGTH
Exemplar skills run roughly 400 to 1700 lines depending on surface area. Cover the practical surface comprehensively; cut filler; every line must earn its place.

RULES
- Create only ${SKILLS_DIR}/${s.name}/SKILL.md. Do not modify any other file. No state-changing git commands anywhere.
- If you cannot verify a claim in the source, omit it or list it under uncertainties in your structured output.

Structured output fields:
- path: the file you wrote
- lineCount: final line count
- sectionsOutline: your H2 titles in order
- apisCovered: the main exported APIs the skill covers
- sourcesRead: files you actually read
- uncertainties: claims you could not fully verify (for the reviewer to settle)`;

const accuracyPrompt = (s, author) =>
	`You are an adversarial technical reviewer. A skill file teaching Effect v4 (${s.specialization}) was just authored at ${SKILLS_DIR}/${s.name}/SKILL.md. Your single job: find every factual or code error before this skill misleads future agents. Assume errors exist until proven otherwise.

GROUND TRUTH
The Effect v4 monorepo at ${ROOT} (package version 4.0.0-beta.80). The skill is correct only if it matches this exact source. Your own memory of Effect — especially v3 — is NOT ground truth; the source is.

PROCESS
1. Read the skill file fully.
2. Verify EVERY code sample and factual claim against the source: exact export names, signatures and overloads, dual (data-first/data-last) forms, option-object key names and their defaults, return types, error types, and behavioral claims (read the implementations, not just the type signatures). Also read the tests, which encode real semantics:
${list(s.tests)}
3. Verify import paths against the package exports (module index files, ${ROOT}/packages/effect/package.json).
4. Settle each uncertainty the author flagged:
${
		list(
			author && author.uncertainties && author.uncertainties.length
				? author.uncertainties
				: ['(none flagged)']
		)
	}
5. Hunt for the classic failure modes: v3 API names that do not exist in v4, renamed or moved exports, wrong option keys, a value where a thunk is required (or vice versa), wrong import subpaths, misused dual signatures, invented defaults, Schema API drift, and behavioral claims contradicted by tests.

SEVERITY
- critical: a snippet would not compile or a claim is flat wrong
- major: misleading or incomplete in a way likely to produce wrong code
- minor: imprecision or stale phrasing

Every finding must cite evidence — the source file path (with line numbers where possible) proving the issue — and a concrete fix. Do NOT report style preferences; accuracy only. Do NOT edit any file. Zero findings is a valid result only if you genuinely verified everything.`;

const stylePrompt = (s, author) =>
	`You are reviewing a newly authored Effect v4 skill file for completeness, scope, and style: ${SKILLS_DIR}/${s.name}/SKILL.md. A separate reviewer is checking line-by-line API accuracy — do not duplicate that. Focus on what is MISSING, MISPLACED, or OFF-STYLE.

1. COMPLETENESS — survey the real module surface yourself by reading the exports, JSDoc, and tests:
${list(s.sources)}
${list(s.tests)}
Identify practically important APIs, options, or patterns the skill omits, and any covered area too thin to guide correct code. Coverage should track real-world usage, not exhaustively mirror the source. The author reports covering: ${
		(author && author.apisCovered ? author.apisCovered : []).join(', ')
	}.

2. SCOPE — the intended scope is: ${s.scope}
Out of scope: ${s.outOfScope}
Flag content that drifts into adjacent skills or duplicates them. Existing adjacent skills you may read for comparison:
${list(s.adjacents)}

3. STYLE — compare against ${SKILLS_DIR}/effect-stream/SKILL.md and ${SKILLS_DIR}/effect-rpc-cluster/SKILL.md: frontmatter with exactly name and description (one line ending in a Use when trigger sentence), opening expert line, an Effect Source Reference H2 section, numbered H2 progression, Key Patterns section, Common Mistakes as the final section, tab-indented single-quoted code, dense second-person prose without filler.

4. PEDAGOGY — would an agent reading this produce correct code quickly? Are the Common Mistakes sharp and specific rather than generic? Are examples realistic rather than toy?

SEVERITY: critical (unusable or badly misscoped), major (important omission or structural break), minor (polish).
Every finding needs evidence and a concrete fix suggestion. Do NOT edit any file.`;

const revisePrompt = (s, findings) =>
	`You are finalizing the Effect v4 skill file ${SKILLS_DIR}/${s.name}/SKILL.md. Two reviewers produced the findings below. Reviewers can be wrong: independently verify each finding against the Effect v4 source at ${ROOT} (package version 4.0.0-beta.80) before acting on it.

- Apply every verified critical and major fix.
- Apply minor fixes when they genuinely improve accuracy or density.
- Reject any finding the source contradicts — record a one-line reason.
- If a finding calls for new coverage, write the addition to the same standard as the rest of the file: verify every API name, signature, and option key in the source first, and match the existing format (tab indentation, single quotes, numbered H2 sections, Common Mistakes remains the final section).
- Keep the frontmatter shape: exactly two keys, name and description.
- Edit only this one file. No state-changing git commands.

FINDINGS (JSON):
${JSON.stringify(findings, null, 2)}

Structured output fields: path, fixesApplied (count), fixesRejected (array of one-line reasons), finalLineCount.`;

const consistencyPrompt = (names) =>
	`New Effect v4 skill files were just authored in ${SKILLS_DIR} (one SKILL.md per directory): ${
		names.join(', ')
	}.

Do a cross-skill consistency pass:
1. Read each new SKILL.md frontmatter and its H2 outline (skim bodies only as needed).
2. Verify each frontmatter name equals its directory name, and each description is a single line that starts with an imperative verb and ends with a Use when trigger sentence. Compare conventions against existing skills — read the frontmatter of ${SKILLS_DIR}/effect-stream/SKILL.md, ${SKILLS_DIR}/effect-batching/SKILL.md, and ${SKILLS_DIR}/effect-http-api/SKILL.md.
3. Check the boundaries hold and descriptions do not claim each other's territory:
   - effect-rpc-api defines contracts; effect-rpc-client consumes; effect-rpc-server serves; cluster stays with the existing effect-rpc-cluster skill.
   - effect-http-server is HttpRouter-level serving (the existing effect-http-api skill owns the declarative HttpApi layer); effect-http-client makes requests.
   - effect-fiber covers fiber lifecycle/supervision; effect-parallelization covers declarative concurrency combinators and coordination primitives.
   - effect-scope covers resource lifecycle; effect-cache covers Cache/ScopedCache.
4. Where two of the new skills border each other, ensure each contains a one-line pointer to the other; add one if missing, in the style the file already uses.
5. You may edit ONLY the new SKILL.md files listed above, and only their frontmatter descriptions or one-line cross-reference pointer lines — never technical content.

Report: edits made per file, plus any residual overlap or naming concerns you did not fix.`;

const AUTHOR_SCHEMA = {
	type: 'object',
	required: [
		'path',
		'lineCount',
		'sectionsOutline',
		'apisCovered',
		'sourcesRead',
		'uncertainties'
	],
	properties: {
		path: { type: 'string' },
		lineCount: { type: 'number' },
		sectionsOutline: { type: 'array', items: { type: 'string' } },
		apisCovered: { type: 'array', items: { type: 'string' } },
		sourcesRead: { type: 'array', items: { type: 'string' } },
		uncertainties: { type: 'array', items: { type: 'string' } }
	}
};

const REVIEW_SCHEMA = {
	type: 'object',
	required: ['overallVerdict', 'findings'],
	properties: {
		overallVerdict: {
			type: 'string',
			enum: ['excellent', 'good', 'needs-fixes']
		},
		findings: {
			type: 'array',
			items: {
				type: 'object',
				required: ['severity', 'claim', 'evidence', 'fix'],
				properties: {
					severity: {
						type: 'string',
						enum: ['critical', 'major', 'minor']
					},
					claim: { type: 'string' },
					evidence: { type: 'string' },
					fix: { type: 'string' }
				}
			}
		}
	}
};

const REVISE_SCHEMA = {
	type: 'object',
	required: ['path', 'fixesApplied', 'fixesRejected', 'finalLineCount'],
	properties: {
		path: { type: 'string' },
		fixesApplied: { type: 'number' },
		fixesRejected: { type: 'array', items: { type: 'string' } },
		finalLineCount: { type: 'number' }
	}
};

log(
	'Authoring ' + SKILLS.length +
		' skills: author -> 2x review -> revise, then a cross-skill consistency pass'
);

const results = await pipeline(
	SKILLS,
	(s) =>
		agent(authorPrompt(s), {
			label: 'author:' + s.name,
			phase: 'Author',
			schema: AUTHOR_SCHEMA,
			model: 'fable'
		})
			.then((a) => (a ? { author: a } : null)),
	(ctx, s) => {
		if (!ctx) return null;
		log(
			s.name + ': authored ' + ctx.author.lineCount + ' lines, ' +
				ctx.author.uncertainties.length + ' uncertainties — reviewing'
		);
		return parallel([
			() =>
				agent(accuracyPrompt(s, ctx.author), {
					label: 'accuracy:' + s.name,
					phase: 'Review',
					schema: REVIEW_SCHEMA,
					model: 'fable'
				}),
			() =>
				agent(stylePrompt(s, ctx.author), {
					label: 'style:' + s.name,
					phase: 'Review',
					schema: REVIEW_SCHEMA,
					model: 'fable'
				})
		]).then((rs) => ({ ...ctx, reviews: rs.filter(Boolean) }));
	},
	(ctx, s) => {
		if (!ctx) return null;
		const findings = ctx.reviews.flatMap((r) => r.findings || []);
		const criticals =
			findings.filter((f) => f.severity === 'critical').length;
		log(
			s.name + ': ' + findings.length + ' findings (' + criticals +
				' critical) from ' + ctx.reviews.length + ' reviewers'
		);
		if (findings.length === 0) return { ...ctx, revise: null };
		return agent(revisePrompt(s, findings), {
			label: 'revise:' + s.name,
			phase: 'Revise',
			schema: REVISE_SCHEMA,
			model: 'fable'
		})
			.then((r) => ({ ...ctx, revise: r }));
	}
);

const perSkill = SKILLS.map((s, i) => {
	const r = results[i];
	if (!r) return { skill: s.name, status: 'failed' };
	const findings = (r.reviews || []).flatMap((x) => x.findings || []);
	return {
		skill: s.name,
		status: 'done',
		path: r.author.path,
		lines: r.revise ? r.revise.finalLineCount : r.author.lineCount,
		verdicts: (r.reviews || []).map((x) => x.overallVerdict),
		findings: {
			critical: findings.filter((f) => f.severity === 'critical').length,
			major: findings.filter((f) => f.severity === 'major').length,
			minor: findings.filter((f) => f.severity === 'minor').length
		},
		fixesApplied: r.revise ? r.revise.fixesApplied : 0,
		fixesRejected: r.revise ? r.revise.fixesRejected : [],
		uncertainties: r.author.uncertainties
	};
});

const authoredNames = perSkill.filter((p) => p.status === 'done').map((p) =>
	p.skill
);
log(
	'Authored ' + authoredNames.length + '/' + SKILLS.length +
		' skills — running cross-skill consistency pass'
);

const consistency = authoredNames.length
	? await agent(consistencyPrompt(authoredNames), {
		label: 'consistency',
		phase: 'Consistency',
		model: 'fable'
	})
	: '(skipped — nothing authored)';

return { perSkill, consistency };
