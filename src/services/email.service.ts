import { Client } from 'node-mailjet';
import {ServerError} from '../errors/index.js';
import {config} from '../config/index.js';

export class EmailService {
	private mailjet: any;

	constructor() {
		// Initialize Mailjet client with API credentials from config
		this.mailjet = Client.apiConnect(
			config.email.emailApiKey || '',
			config.email.emailApiSecret || ''
		);
	}

	async sendHtmlEmail(emailAddress: string, subject: string, body: string) {
		const messageData = {
			Messages: [
				{
					From: {
						Email: config.email.fromAddress!,
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
