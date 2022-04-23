import { execaCommandSync as exec } from 'execa';
import { chProjectDir, copyPackageFiles, rmDist } from 'lion-system';
import { join } from 'desm';

chProjectDir(import.meta.url);
rmDist();
exec('napi build --platform --release', {
	cwd: join(import.meta.url, '../src/secure-input'),
	stdio: 'inherit',
});
exec('tsc');
exec('tsc-alias');
await copyPackageFiles();
