import fastifyFormbody from '@fastify/formbody';
import type { RouteHandler } from 'fastify';
import fastify from 'fastify';
import process from 'node:process';
import twilio from 'twilio';

import { inputPasscodeKeystrokes } from '~/utils/passcode.js';
import { getCallSpinner } from '~/utils/spinner.js';

const { twiml } = twilio;

interface AppServerContext {
	shouldAutoInputPasscode: boolean;
	hasPasscodeBeenEntered: boolean;
	resolve: (digits: string) => void;
	reject: (error: Error) => void;
}

function createInputRoute(context: AppServerContext) {
	const inputRoute: RouteHandler<{ Body: { Digits: string } }> = async (
		request,
		reply
	) => {
		const voice = new twiml.VoiceResponse();

		const digits = request.body.Digits;
		if (digits === undefined) {
			voice.redirect('/voice');
		} else {
			if (/^\d{5}$/.test(digits)) {
				if (context.shouldAutoInputPasscode) {
					inputPasscodeKeystrokes({ passcode: digits }).catch(
						(error: unknown) => {
							const err = error as Error;
							console.error('There was an error.');
							// Replace all numeric characters with asterisks to prevent leaking
							// the password
							console.error('Name:', err.name.replace(/\d/g, '*'));
							console.error('Message:', err.message.replace(/\d/g, '*'));
						}
					);
				} else {
					context.resolve(digits);
				}

				voice.say('Thank you!');
			} else {
				voice.say("Sorry, that wasn't five digits. Please try again.");
			}
		}

		await reply.type('text/xml').send(voice.toString());
	};

	return inputRoute;
}

function createVoiceRoute(_context: AppServerContext) {
	const voiceRoute: RouteHandler = async (request, reply) => {
		const callSpinner = getCallSpinner();
		callSpinner.start('Call answered. Waiting for 5-digit passcode input...');

		const voice = new twiml.VoiceResponse();

		const gather = voice.gather({
			numDigits: 5,
			action: '/input',
			method: 'POST',
		});

		gather.say('Please type in the five-digit passcode.');

		// If the user doesn't type in a code, loop
		voice.redirect('/voice');

		await reply.type('text/xml').send(voice.toString());
	};

	return voiceRoute;
}

function createEventsRoute(context: AppServerContext) {
	const eventsRoute: RouteHandler<{ Body: { CallStatus: string } }> = (
		request,
		_reply
	) => {
		if (
			request.body.CallStatus === 'completed' &&
			!context.hasPasscodeBeenEntered
		) {
			context.reject(new Error('Passcode has not been entered.'));
		}
	};

	return eventsRoute;
}

interface StartAppServerProps {
	port: number;
	shouldAutoInputPasscode: boolean;
}

export async function startAppServer({
	port,
	shouldAutoInputPasscode,
}: StartAppServerProps): Promise<string> {
	return new Promise((resolve, reject) => {
		const context: AppServerContext = {
			shouldAutoInputPasscode,
			hasPasscodeBeenEntered: false,
			resolve,
			reject,
		};

		const app = fastify({
			logger: process.env.DEBUG === '1',
		});

		void app.register(fastifyFormbody);

		app.get('/health', async (request, reply) => {
			await reply.send('Operational!');
		});

		app.post('/input', createInputRoute(context));
		app.post('/voice', createVoiceRoute(context));
		app.post('/events', createEventsRoute(context));

		app
			.listen(port, '0.0.0.0')
			.then((address) => {
				console.info(`🚀 Server started on ${address}`);
			})
			.catch(reject);
	});
}
