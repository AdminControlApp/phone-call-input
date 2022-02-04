import 'dotenv/config.js';
import { makeCall } from '~/utils/call.js';
import { startNgrokServer } from '~/utils/ngrok.js';
import { startAppServer } from '~/utils/server.js';

await startAppServer();
const ngrokServerUrl = await startNgrokServer();
await makeCall({ ngrokServerUrl });
