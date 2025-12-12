import * as Mailjet from 'node-mailjet';
import { ServerError } from '../errors/index.js';
import { config } from '../config/index.js';

export class EmailService {
	private mailjet: Mailjet.Client;

	constructor() {
		// Initialize Mailjet client with API credentials from config
		this.mailjet = new (Mailjet as any).default({
			apiKey: config.email?.emailApiKey || '',
			apiSecret: config.email?.emailApiSecret || ''
		});
	}

	async sendHtmlEmail(emailAddress: string, subject: string, body: string) {
		if (!config.email?.fromAddress) {
			throw new ServerError('From address is not set in the config');
		}
		const messageData = {
			Messages: [
				{
					From: {
						Email: config.email?.fromAddress,
						Name: config.appName || 'Application'
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
