import 'dotenv/config.js';
import { makeCall } from '~/utils/call.js';
import { startNgrokServer } from '~/utils/ngrok.js';
import { startAppServer } from '~/utils/server.js';

try {
	await startAppServer();
	const ngrokServerUrl = await startNgrokServer();
	await makeCall({ ngrokServerUrl });
} catch (error: unknown) {
	const err = error as Error;
	console.error('There was an error.');
	// Replace all numeric characters with asterisks to prevent leaking
	// the password
	console.error('Name:', err.name.replace(/\d/g, '*'));
	console.error('Message:', err.message.replace(/\d/g, '*'));
}
