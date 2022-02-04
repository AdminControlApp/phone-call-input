import ora from 'ora';
import onetime from 'onetime';

export const getCallSpinner = onetime(() =>
	ora('Waiting for call to be answered...')
);
