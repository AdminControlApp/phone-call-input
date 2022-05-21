declare type PhoneCallInputProps = {
    ngrokBinPath?: string;
    destinationPhoneNumber: string;
    originPhoneNumber: string;
    twilioAccountSid: string;
    twilioAuthToken: string;
};
export declare function phoneCallInput({ destinationPhoneNumber, originPhoneNumber, twilioAccountSid, twilioAuthToken, ngrokBinPath, }: PhoneCallInputProps): Promise<string>;
export {};
