import pc from 'picocolors';

const timeFormat = new Intl.DateTimeFormat([], {
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hour12: false,
});

export function devLog(message: string): void {
	console.error(`${pc.dim(timeFormat.format(new Date()))} ${message}`);
}

export function devServerBanner(
	version: string,
	readyMs: number,
	localUrl: string,
	agents: readonly string[],
	workflows: readonly string[],
	channels: readonly string[],
): void {
	console.error('');
	console.error(`  ${pc.bold(pc.blue(`bapX v${version}`))} ${pc.dim(`ready in`)} ${pc.bold(`${readyMs} ms`)}`);
	console.error(`  ${pc.blue(`└─ ${localUrl}`)}`);
	console.error('');
	if (agents.length > 0) console.error(`  ${pc.bold('Agents:'.padEnd(13))}${summarizeNames(agents)}`);
	if (workflows.length > 0)
		console.error(`  ${pc.bold('Workflows:'.padEnd(13))}${summarizeNames(workflows)}`);
	if (channels.length > 0)
		console.error(`  ${pc.bold('Channels:'.padEnd(13))}${summarizeNames(channels)}`);
	console.error('');
}

function summarizeNames(names: readonly string[]): string {
	const visible = names.slice(0, 2).join(', ');
	const remaining = names.length - 2;
	if (remaining <= 0) return visible;
	return `${visible}, ${pc.dim(`+${remaining} ${remaining === 1 ? 'other' : 'others'}`)}`;
}

export function brand(lines: [string, string, string]): string {
	const mark = [pc.blue(' ▗ '), pc.blue(' ▚ '), pc.blue(' ▘ ')];
	return lines.map((line, index) => `${mark[index]} ${line}`).join('\n');
}

export function brandRows(title: string, rows: readonly [string, string | undefined][]): void {
	const visible = rows.filter(
		(row): row is [string, string] => row[1] !== undefined && row[1] !== '',
	);
	const mark = [pc.blue(' ▗ '), pc.blue(' ▚ '), pc.blue(' ▘ ')];
	console.error(`${mark[0]} ${pc.bold(title)}`);
	visible.forEach(([label, value], index) => {
		const prefix = mark[index + 1] ?? '   ';
		console.error(`${prefix} ${pc.dim(label.padEnd(10))}${value}`);
	});
}

export function row(label: string, value: string | undefined): void {
	if (!value) return;
	console.error(`    ${pc.dim(label.padEnd(10))}${value}`);
}

export function section(title: string, values: readonly string[]): void {
	if (values.length === 0) return;
	console.error('');
	console.error(`    ${pc.bold(title)}`);
	for (const value of values) console.error(`      ${value}`);
}

export function note(message: string): void {
	console.error(`    ${pc.dim(message)}`);
}

export function error(message: string): void {
	console.error(`${pc.bold('Error')}: ${message}`);
}

export function success(message: string): void {
	console.error(`${pc.blue('done')} ${message}`);
}
