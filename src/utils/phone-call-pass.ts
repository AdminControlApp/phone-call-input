import getPort from 'get-port';
import { makeCall } from './call.js';
import { startNgrokServer } from './ngrok.js';
import { startAppServer } from './server.js';

type PhoneCallPassProps = {
	ngrokBinPath?: string;
	destinationPhoneNumber: string;
	originPhoneNumber: string;
	twilioAccountSid: string;
	twilioAuthToken: string;
};
export async function phoneCallPass({
	destinationPhoneNumber,
	originPhoneNumber,
	twilioAccountSid,
	twilioAuthToken,
	ngrokBinPath,
}: PhoneCallPassProps) {
	try {
		const port = await getPort();
		await startAppServer({ port });
		const ngrokServerUrl = await startNgrokServer({
			port,
			binPath: ngrokBinPath,
		});
		await makeCall({
			ngrokServerUrl,
			destinationPhoneNumber,
			originPhoneNumber,
			twilioAccountSid,
			twilioAuthToken,
		});
	} catch (error: unknown) {
		const err = error as Error;
		console.error('There was an error.');
		// Replace all numeric characters with asterisks to prevent leaking
		// the password
		console.error('Name:', err.name.replace(/\d/g, '*'));
		console.error('Message:', err.message.replace(/\d/g, '*'));
	}
}
