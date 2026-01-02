import { IEmailClient } from "../models/email-client.interface.js";

export class TestEmailClient implements IEmailClient {
    sendHtmlEmail(toEmailAddress: string, subject: string, body: string): Promise<void> {
        console.log(`Sending email to ${toEmailAddress} with subject ${subject} and body ${body}`);
        return Promise.resolve();
    }
}