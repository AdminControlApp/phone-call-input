import ngrok from 'ngrok';

export async function startNgrokServer({ port }: { port: number }) {
	const ngrokServerUrl = await ngrok.connect(port);
	console.info(`✨ ngrok server started at ${ngrokServerUrl}`);
	return ngrokServerUrl;
}
