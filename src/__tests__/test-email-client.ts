import { IEmailClient } from "../models/email-client.interface.js";

export class TestEmailClient implements IEmailClient {
    sendResetPasswordEmail(toEmailAddress: string, resetPasswordLink: string): Promise<void> {
        console.log(`Sending reset password email to ${toEmailAddress} with reset password link ${resetPasswordLink}`);
        return Promise.resolve();
    }
}