import process from 'node:process';
import onetime from 'onetime';

export const getPort = onetime(() => Number(process.env.PORT) ?? 5050);
