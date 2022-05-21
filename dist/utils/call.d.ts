declare type MakeCallProps = {
    ngrokServerUrl: string;
    twilioAccountSid: string;
    twilioAuthToken: string;
    destinationPhoneNumber: string;
    originPhoneNumber: string;
};
export declare function makeCall({ ngrokServerUrl, twilioAccountSid, twilioAuthToken, destinationPhoneNumber, originPhoneNumber, }: MakeCallProps): Promise<import("twilio/lib/rest/api/v2010/account/call").CallInstance>;
export {};
