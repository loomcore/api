import sgMail from '@sendgrid/mail';
import {ServerError} from '../errors/index.js';
import {config} from '../config/index.js';

export class EmailService {
	constructor() {
		sgMail.setApiKey(config.email.sendGridApiKey as string);
	}

	async sendHtmlEmail(emailAddress: string, subject: string, body: string) {
		const msg = {
			to: emailAddress, // Change to your recipient
			from: config.email.fromAddress!, // Change to your verified sender
			subject: subject,
			html: `${body}`,
		};

		try {
			await sgMail.send(msg);
			console.log(`Email sent to ${emailAddress} with subject ${subject}`);
		}
		catch (error) {
			console.error('Error sending email:', error);
			throw new ServerError('Error sending email');
		}
	}

}
