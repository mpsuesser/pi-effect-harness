import { testPattern } from './helpers/pattern-test-harness.ts';

testPattern({
	name: 'avoid-node-imports',
	tag: 'use-effect-platform',
	shouldMatch: [
		'import { spawn } from "node:child_process"',
		'import http from "node:http"',
		'import * as stream from "node:stream"',
		'import readline from "node:readline"',
		'import "node:crypto"',
		"const http = require('node:http')",
		'const crypto = await import("node:crypto")'
	],
	shouldNotMatch: [
		'import * as Path from "effect/Path"',
		'import * as FileSystem from "effect/FileSystem"',
		'import * as HttpClient from "effect/unstable/http/HttpClient"',
		'import * as ChildProcess from "effect/unstable/process/ChildProcess"',
		'import { Stream } from "effect"',
		'import * as Terminal from "effect/Terminal"',
		'import { node } from "other-lib"',
		'import * as path from "node:path"',
		'import * as fs from "node:fs"',
		'import { readFile } from "node:fs/promises"',
		"const fs = require('node:fs')",
		"const path = require( 'node:path' )",
		'const fs = await import("node:fs")'
	]
});
