import process from 'node:process';
import twilio from 'twilio';

export async function makeCall({ ngrokServerUrl }: { ngrokServerUrl: string }) {
	const accountSid = process.env.TWILIO_ACCOUNT_SID;
	const authToken = process.env.TWILIO_AUTH_TOKEN;
	const phoneNumberToCall = process.env.PHONE_NUMBER_TO_CALL;
	const originPhoneNumber = process.env.ORIGIN_PHONE_NUMBER;

	const client = twilio(accountSid, authToken);

	console.info(`📞 Calling ${phoneNumberToCall}...`);
	const call = await client.calls.create({
		url: `${ngrokServerUrl}/voice`,
		to: phoneNumberToCall,
		from: originPhoneNumber,
		callerId: '+1 (903) 270-3921',
		timeLimit: 60,
	});

	return call;
}
