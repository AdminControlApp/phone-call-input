import { join } from 'desm';
import { execaCommandSync as exec } from 'execa';
import { chProjectDir, copyPackageFiles, rmDist } from 'lion-system';

chProjectDir(import.meta.url);
rmDist();
exec('napi build --platform --release --config napi.config.json', {
	stdio: 'inherit',
	cwd: join(import.meta.url, '../src/secure-input'),
});
exec('tsc');
exec('tsc-alias');
await copyPackageFiles({
	additionalFiles: [
		'src/secure-input/secure-input.darwin-x64.node',
		'src/secure-input/index.js',
		'src/secure-input/index.d.ts',
	],
});
