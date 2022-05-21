import ngrok from 'ngrok';
export async function startNgrokServer({ port, binPath, }) {
    const ngrokServerUrl = await ngrok.connect({
        addr: port,
        binPath: binPath === undefined ? undefined : () => binPath,
    });
    console.info(`✨ ngrok server started at ${ngrokServerUrl}`);
    return ngrokServerUrl;
}
