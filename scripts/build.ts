import { join } from 'desm';
import { execaCommandSync as exec } from 'execa';
import { chProjectDir, copyPackageFiles, rmDist } from 'lion-system';

chProjectDir(import.meta.url);
rmDist();
exec('napi build --platform --release --config napi.config.json --js index.cjs --dts index.d.cts', {
	stdio: 'inherit',
	cwd: join(import.meta.url, '../src/secure-input'),
});
await copyPackageFiles({
	additionalFiles: [
		'src/secure-input/secure-input.darwin-x64.node',
		'src/secure-input/index.cjs',
		'src/secure-input/index.d.ts',
	],
});
exec('tsc');
exec('tsc-alias');
