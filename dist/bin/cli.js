import { program } from 'commander';
import process from 'node:process';
import { phoneCallInput } from '../utils/phone-call-input.js';
program
    .option('--origin-phone-number <phone-number>')
    .option('--destination-phone-number <phone-number>')
    .option('--twilio-account-sid <twilio-account-sid>')
    .option('--twilio-auth-token <twilio-auth-token>')
    .option('--ngrok-bin-path <ngrok-bin-path>');
program.parse();
const opts = program.opts();
const originPhoneNumber = opts.originPhoneNumber ?? process.env.ORIGIN_PHONE_NUMBER;
const destinationPhoneNumber = opts.destinationPhoneNumber ?? process.env.DESTINATION_PHONE_NUMBER;
const twilioAccountSid = opts.twilioAccountSid ?? process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = opts.twilioAuthToken ?? process.env.TWILIO_AUTH_TOKEN;
const { ngrokBinPath } = opts;
if (originPhoneNumber === undefined) {
    throw new Error('Origin phone number not provided.');
}
if (destinationPhoneNumber === undefined) {
    throw new Error('Destination phone number not provided.');
}
if (twilioAccountSid === undefined) {
    throw new Error('Twilio account SID not provided.');
}
if (twilioAuthToken === undefined) {
    throw new Error('Twilio auth token not provided.');
}
await phoneCallInput({
    destinationPhoneNumber,
    originPhoneNumber,
    twilioAccountSid,
    twilioAuthToken,
    ngrokBinPath,
});
