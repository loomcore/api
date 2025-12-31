import * as Mailjet from 'node-mailjet';
import { ServerError } from '../errors/index.js';
import { config } from '../config/index.js';

export class EmailService {
	private mailjet: Mailjet.Client | null = null;

	constructor() {
		// Only initialize Mailjet if config is available and email config is provided
		// This allows EmailService to be instantiated during migrations even if email isn't configured yet
		if (config && config.email?.emailApiKey && config.email?.emailApiSecret) {
			this.mailjet = new (Mailjet as any).default({
				apiKey: config.email.emailApiKey,
				apiSecret: config.email.emailApiSecret
			});
		}
	}

	async sendHtmlEmail(emailAddress: string, subject: string, body: string) {
		if (!config || !config.email?.fromAddress) {
			throw new ServerError('Email configuration is not available. From address is not set in the config.');
		}
		
		if (!this.mailjet) {
			throw new ServerError('Email service is not configured. Email API credentials are not set in the config.');
		}
		const messageData = {
			Messages: [
				{
					From: {
						Email: config.email?.fromAddress,
						Name: config.app.name || 'Application'
					},
					To: [
						{
							Email: emailAddress
						}
					],
					Subject: subject,
					HTMLPart: body
				}
			]
		};

		try {
			const result = await this.mailjet
				.post('send', { version: 'v3.1' })
				.request(messageData);

			console.log(`Email sent to ${emailAddress} with subject ${subject}`);
			return result;
		}
		catch (error) {
			console.error('Error sending email:', error);
			throw new ServerError('Error sending email');
		}
	}
}
