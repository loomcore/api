import crypto from 'crypto';
import {EmptyUserContext, IPasswordResetToken, PasswordResetTokenSpec} from '@loomcore/common/models';
import { GenericApiService } from './generic-api-service/generic-api.service.js';
import { Database } from '../database/models/database.js';

export class PasswordResetTokenService extends GenericApiService<IPasswordResetToken> {
	constructor(database: Database) {
		super(database, 'passwordResetTokens', 'passwordResetToken', PasswordResetTokenSpec);
	}

	async createPasswordResetToken(email: string, expiresOn: number): Promise<IPasswordResetToken | null> {
		const lowerCaseEmail = email.toLowerCase();
		await this.deleteMany(EmptyUserContext, { filters: { email: { eq: lowerCaseEmail } } });

		const passwordResetToken: Partial<IPasswordResetToken> = {
			email: lowerCaseEmail,
			token: crypto.randomBytes(40).toString('hex'),
			expiresOn: expiresOn,
		};

		return super.create(EmptyUserContext, passwordResetToken);
	}

	async getByEmail(email: string): Promise<IPasswordResetToken | null> {
		return  await super.findOne(EmptyUserContext, { filters: { email: { eq: email.toLowerCase() } } });
	}
}
