import fs from 'node:fs';
import path from 'node:path';

// One durable JSON store for the platform's collections.
//
// This existed three times — in platform-store, connector-store and
// api-gateway — as a copy-pasted block, and the copies had drifted on the thing
// that matters most. Only platform-store fsynced and kept a backup; the two
// holding encrypted connector credentials and customer API keys did neither.
// The failure platform-store's own comment described — a host crash leaving an
// empty or partial file where the records used to be — was unmitigated in
// exactly the two stores where losing the file is worst.
//
// The temp-file name also collided: `${file}.${pid}.tmp` is the same path for
// two concurrent writes in one process, so one could truncate the other's
// half-written file. It now carries a per-write random suffix.

// `onError` lets a caller keep its own typed error — platform-store raises
// PlatformStorageError, which its callers and tests distinguish from a generic
// failure. Consolidating storage must not flatten that distinction.
export function readJson(file, fallback, label, onError) {
	let raw;
	try {
		raw = fs.readFileSync(file, 'utf8');
	} catch (error) {
		// Only a genuinely missing file may initialise an empty collection. Any
		// other failure treated as "empty" would let the next write persist an
		// empty-derived collection, permanently deleting every record.
		if (error?.code === 'ENOENT') return fallback;
		throw onError ? onError(file, error) : new Error(`${label} is unreadable (${error?.code || 'unknown'})`);
	}
	try {
		return JSON.parse(raw);
	} catch (error) {
		throw onError ? onError(file, error) : new Error(`${label} is corrupt`);
	}
}

export function writeJson(file, value) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const temporary = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
	const handle = fs.openSync(temporary, 'w', 0o600);
	try {
		fs.writeFileSync(handle, `${JSON.stringify(value, null, 2)}\n`);
		// Force the bytes to disk before the rename. Without this a crash between
		// write and rename can leave a zero-length file under the real name.
		fs.fsyncSync(handle);
	} finally {
		fs.closeSync(handle);
	}
	// Keep the previous good copy: rename is atomic, but a corrupt *source*
	// would still replace a healthy target.
	if (fs.existsSync(file)) {
		try {
			fs.copyFileSync(file, `${file}.bak`);
		} catch {
			// A missing backup must never block the write itself.
		}
	}
	fs.renameSync(temporary, file);
}
