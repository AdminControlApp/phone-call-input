import ngrok from 'ngrok';
import { getPort } from '~/utils/port.js';

export async function startNgrokServer() {
	const ngrokServerUrl = await ngrok.connect(getPort());
	console.info(`✨ Ngrok server started at ${ngrokServerUrl}`);
	return ngrokServerUrl;
}
