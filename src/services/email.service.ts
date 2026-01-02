import { ServerError } from '../errors/index.js';
import { config } from '../config/index.js';
import { IEmailConfig } from '../models/email-config.interface.js';
import { IEmailClient } from '../models/email-client.interface.js';

export class EmailService {
	private emailConfig: IEmailConfig;
	private emailClient: IEmailClient;
	constructor(emailClient: IEmailClient) {
		if (config.email) {
			this.emailConfig = config.email;
		} else {
			throw new ServerError('Email configuration is not available. Email API credentials are not set in the config.');
		}
		this.emailClient = emailClient;
	}

	async sendHtmlEmail(emailAddress: string, subject: string, body: string) {
		const messageData = {
			Messages: [
				{
					From: {
						Email: this.emailConfig.fromAddress,
						Name: config.app.name
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
			await this.emailClient.sendHtmlEmail(emailAddress, subject, body);
			console.log(`Email sent to ${emailAddress} with subject ${subject}`);
		}
		catch (error) {
			console.error('Error sending email:', error);
			throw new ServerError('Error sending email');
		}
	}
}
