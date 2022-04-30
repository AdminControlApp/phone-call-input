import twilio from 'twilio';

type MakeCallProps = {
	ngrokServerUrl: string;
	twilioAccountSid: string;
	twilioAuthToken: string;
	destinationPhoneNumber: string;
	originPhoneNumber: string;
};
export async function makeCall({
	ngrokServerUrl,
	twilioAccountSid,
	twilioAuthToken,
	destinationPhoneNumber,
	originPhoneNumber,
}: MakeCallProps) {
	const client = twilio(twilioAccountSid, twilioAuthToken);

	console.info(`📞 Calling ${destinationPhoneNumber}...`);
	const call = await client.calls.create({
		url: `${ngrokServerUrl}/voice`,
		to: destinationPhoneNumber,
		from: originPhoneNumber,
		callerId: '+1 (903) 270-3921',
		statusCallback: `${ngrokServerUrl}/events`,
		timeLimit: 60,
	});

	return call;
}
