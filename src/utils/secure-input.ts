import { execaSync } from 'execa';
import { join } from 'desm';

export function getSecureInputApps(): Array<{ pid: number; name: string }> {
	const secureInputAppPids = JSON.parse(
		execaSync('python3', [join(import.meta.url, '../python/secure-input.py')])
			.stdout
	) as string[];

	if (secureInputAppPids.length > 0) {
		const apps = execaSync('ps', [
			'-c',
			'-o',
			'pid=,command=',
			'-p',
			secureInputAppPids.join(','),
		]).stdout;
		return apps.split('\n').map((line) => {
			const matches = /^\s*(\d+) (.*$)/.exec(line)!;
			const pid = Number(matches[1]);
			const name = matches[2]!;
			return {
				pid,
				name,
			};
		});
	}

	return [];
}
