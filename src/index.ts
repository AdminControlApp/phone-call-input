import process from 'node:process';
import fastify from 'fastify';
import twilio, { twiml } from 'twilio';
import type VoiceResponse from 'twilio/lib/twiml/VoiceResponse.js';
import ngrok from 'ngrok';



await ngrok.connect();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const phoneNumberToCall = process.env.PHONE_NUMBER_TO_CALL;
const originPhoneNumber = process.env.ORIGIN_PHONE_NUMBER;

const client = twilio(accountSid, authToken);

function gather(voice: VoiceResponse) {
	const gatherNode = voice.gather({ numDigits: 4 });
	gatherNode.say('Please enter the 4-digit passcode.');
	voice.redirect('/voice');
}

const call = await client.calls.create({
	url: 'https://demo.twilio.com/docs/classic.mp3',
	to: phoneNumberToCall,
	from: originPhoneNumber,
});

const app = fastify();

app.post('/voice', async (request, reply) => {
	const voice = new twiml.VoiceResponse();

	voice.say({ voice: 'alice' }, 'too sus');

	await reply.type('text/xml');
	await reply.send(voice.toString());
});

app.listen(5050, (err, address) => {
	console.log(`🚀 Server started on ${address}`);
});
