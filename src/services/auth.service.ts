import {Db, InsertOneResult, AnyError, ObjectId, Collection, UpdateResult} from 'mongodb';
import {Request, Response} from 'express';
import moment from 'moment';
import crypto from 'crypto';
import {IUserContext, IUser, ITokenResponse, EmptyUserContext, passwordValidator, UserSpec, ILoginResponse} from '@loomcore/common/models';
import {entityUtils} from '@loomcore/common/utils';

import {BadRequestError, DuplicateKeyError, ServerError} from '../errors/index.js';
import {JwtService, EmailService} from './index.js';
import {GenericApiService} from './generic-api.service.js';
import {PasswordResetTokenService} from './password-reset-token.service.js';
import {conversionUtils, passwordUtils} from '../utils/index.js';
import {config} from '../config/index.js';

export class AuthService extends GenericApiService<IUser> {
	private refreshTokensCollection: Collection;
	private passwordResetTokenService: PasswordResetTokenService;
	private emailService: EmailService;

	constructor(db: Db) {
		super(db, 'users', 'user', UserSpec);

		//console.log(`In AuthService constructor, config: ${JSON.stringify(config)}`);

		this.refreshTokensCollection = db.collection('refreshTokens');
		this.passwordResetTokenService = new PasswordResetTokenService(db);
		this.emailService = new EmailService();
	}

	async attemptLogin(req: Request, res: Response, email: string, password: string): Promise<ILoginResponse | null> {
		const lowerCaseEmail = email.toLowerCase();
		const user = await this.getUserByEmail(lowerCaseEmail);
		
		// Basic validation to prevent errors with undefined user
		if (!user) {
			throw new BadRequestError('Invalid Credentials');
		}

		const passwordsMatch = await passwordUtils.comparePasswords(user.password!, password);
		if (!passwordsMatch) {
			throw new BadRequestError('Invalid Credentials');
		}

		const userContext = { 
			user: user, 
			_orgId: user._orgId 
		};

		const deviceId = this.getAndSetDeviceIdCookie(req, res);
		const loginResponse = await this.logUserIn(userContext, deviceId);
		return loginResponse;
	}
	
	async logUserIn(userContext: IUserContext, deviceId: string) {
		const payload = userContext;
		const accessToken = this.generateJwt(payload);
		// upon login, we want to create a new refreshToken with a full expiresOn expiration. If the client is capable of finding an unexpired refreshToken
		//  persisted locally, it can use that to request a new accessToken - it should NOT try to log in again. Every time there's a successful cred swap, 
		//  we start with a brand new refreshToken.
		const refreshTokenObject = await this.createNewRefreshToken(userContext.user._id!.toString(), deviceId);
		const accessTokenExpiresOn = this.getExpiresOnFromSeconds(config.auth.jwtExpirationInSeconds);

		let loginResponse = null;
		if (refreshTokenObject) {
			const tokenResponse = {
				accessToken,
				refreshToken: refreshTokenObject.token,
				expiresOn: accessTokenExpiresOn
			};

			// Update lastLoggedIn in a non-blocking way
			this.updateLastLoggedIn(userContext.user._id!.toString())
				.catch(err => console.log(`Error updating lastLoggedIn: ${err}`));
			
			this.transformSingle(userContext.user);
			loginResponse = {tokens: tokenResponse, userContext };
		}

		return loginResponse;
	}

	async getUserById(id: string): Promise<IUser | null> {
		if (!entityUtils.isValidObjectId(id)) {
			throw new BadRequestError('id is not a valid ObjectId');
		}

		const user = await this.findOne(EmptyUserContext, {_id: new ObjectId(id)});
		return user;
	}

	async getUserByEmail(email: string): Promise<IUser | null> {
		const user = await this.findOne(EmptyUserContext, {email: email.toLowerCase()});
		return user;
	}

	async createUser(userContext: IUserContext, user: IUser): Promise<IUser | null> {
		// You currently don't have to be logged-in to create a user - we'll need to vette exactly what you do need based on the scenario.
		// todo: validate that the user._orgId exists - think through the whole user creation process
		//  I think a user either has to be created by someone with the authorization to do so, or they need to be
		//  joining an org that has open registration, or else they have some sort of invite to join an org,
		//  or initialSetup is occurring.
		// prepareEntity handles hashing the password, lowercasing the email, and other entity transformations before any create or update.
		const createdUser = await this.create(userContext, user);
		return createdUser;
	}

	async requestTokenUsingRefreshToken(req: Request): Promise<ITokenResponse | null> {
		const refreshToken = req.query.refreshToken;
		const deviceId = this.getDeviceIdFromCookie(req);
		//console.log(`deviceId: ${deviceId}`); // todo: delete me
		let tokens: ITokenResponse | null = null;

		if (refreshToken && typeof refreshToken === 'string' && deviceId) {
			let userId = null;

			// look for this particular refreshToken in our database. refreshTokens are assigned to deviceIds,
			//  so they can only be retrieved together.
			const activeRefreshToken = await this.getActiveRefreshToken(refreshToken, deviceId);
			//console.log(`activeRefreshToken: ${activeRefreshToken}`); // todo: delete me
			if (activeRefreshToken) {
				userId = activeRefreshToken.userId;

				if (userId) {
					// todo: why do we need to create a new refreshToken? Can we just let the original one expire and create a new one after they login at that time?
					// we found an activeRefreshToken, and we know what user it was assigned to
					//  - create a new refreshToken and persist it to the database
					// upon refresh, we want to create a new refreshToken maintaining the existing expiresOn expiration
					tokens = await this.createNewTokens(userId, deviceId, activeRefreshToken.expiresOn);
				}
			}
		}
		return tokens;
	}

	// async requestTokenUsingRefreshToken(refreshToken: string, deviceId: string): Promise<ITokenResponse | null> {
	// 	// refreshToken - { token, deviceId, userId, expiresOn, created, createdBy, createdByIp, revoked?, revokedBy? }
	// 	//  not using revoked and revokedBy currently - I'm just deleting refreshTokens by userId and deviceId (there can be only one!!)
	// 	let userId = null;

	// 	// look for this particular refreshToken in our database. refreshTokens are assigned to deviceIds,
	// 	//  so they can only be retrieved together.
	// 	const activeRefreshToken = await this.getActiveRefreshToken(refreshToken, deviceId);
	// 	console.log(`activeRefreshToken: ${activeRefreshToken}`); // todo: delete me
	// 	let newTokens = null;
	// 	if (activeRefreshToken) {
	// 		userId = activeRefreshToken.userId;

	// 		if (userId) {
	// 			// we found an activeRefreshToken, and we know what user it was assigned to
	// 			//  - create a new refreshToken and persist it to the database
	// 			// upon refresh, we want to create a new refreshToken maintaining the existing expiresOn expiration
	// 			//newRefreshTokenPromise = this.createNewRefreshToken(userId, deviceId, activeRefreshToken.expiresOn);
	// 			newTokens = await this.createNewTokens(userId, deviceId, activeRefreshToken.expiresOn);
	// 		}
	// 	}

	// 	return newTokens;
	// }

	async changeLoggedInUsersPassword(userContext: IUserContext, body: any) {
		const validationResult = entityUtils.validate(passwordValidator, { password: body.password });
		entityUtils.handleValidationResult(validationResult, 'AuthService.changePassword');

		const queryObject = {_id: new ObjectId(userContext.user._id!)};
		const result = await this.changePassword(userContext, queryObject, body.password);
		return result;
	}

	async changePassword(userContext: IUserContext, queryObject: any, password: string): Promise<UpdateResult> {
		// queryObject will either be {_id: someUserId} for loggedInUser change or {email: someEmail} from forgotPassword
		const updates = { password: password, _lastPasswordChange: moment().utc().toDate() };
		const updatedUsers = await super.update(userContext, queryObject, updates as Partial<IUser>);

		const result: UpdateResult = {
			acknowledged: true,
			modifiedCount: updatedUsers.length,
			upsertedId: null,
			upsertedCount: 0,
			matchedCount: updatedUsers.length
		};

		return result;
	}

	async createNewTokens(userId: string, deviceId: string, refreshTokenExpiresOn: number) {
		let createdRefreshTokenObject: any = null;

		// todo: do we really need to create a new refreshToken? Can we just let the original one expire and create a new one at that time?
		const newRefreshToken = await this.createNewRefreshToken(userId, deviceId, refreshTokenExpiresOn);
		let user = null;
		if (newRefreshToken) {
			// we created a brand new refreshToken - now get the user object associated with this refreshToken
			createdRefreshTokenObject = newRefreshToken;
			user = await this.getUserById(userId);
		}

		//  return the new refreshToken and accessToken in a tokenResponse (just like we did in login)
		let tokenResponse = null;
		if (user && createdRefreshTokenObject) {
			// todo: there's a really good chance this will introduce a bug where selectedOrgContext is lost when using refreshToken
			//  to get a new accessToken because we are hard-coding it to the user's org right here.
			//  We'll need to find a way to have the client tell us what the selectedOrg should be when they
			//  call requestTokenUsingRefreshToken() - AND we'll need to VALIDATE that they can select that org
			//  if (selectedOrgId !== user._orgIdorgId) then user.isMetaAdmin must be true.
			const payload = {
				user: user, 
				_orgId: user._orgId ? String(user._orgId) : undefined
			};  // _orgId is the selectedOrg (the org of the user for any non-metaAdmins)
			const accessToken = this.generateJwt(payload);
			const accessTokenExpiresOn = this.getExpiresOnFromSeconds(config.auth.jwtExpirationInSeconds);
			tokenResponse = {
				accessToken,
				refreshToken: createdRefreshTokenObject.token,
				expiresOn: accessTokenExpiresOn
			};
		}
		return tokenResponse;
	}

	async getActiveRefreshToken(refreshToken: string, deviceId: string) {
		const refreshTokenResult = await this.refreshTokensCollection.findOne({token: refreshToken, deviceId: deviceId});
		let activeRefreshToken = null;

		if (refreshTokenResult) {
			// validate that the refreshToken has not expired
			const now = Date.now();
			const notExpired = refreshTokenResult.expiresOn > now;
			if (notExpired) {
				activeRefreshToken = refreshTokenResult;
			}
		}

		return activeRefreshToken;
	}

	async createNewRefreshToken(userId: string, deviceId: string, existingExpiresOn: number | null = null) {
		// if existingExpiresOn is provided, use it, otherwise we start over.  The expiresOn on the refreshToken basically represents
		//  how often the user must log in.  If we are refreshing from an existing token, we should maintain the existing expiresOn.
		const expiresOn = existingExpiresOn ? existingExpiresOn : this.getExpiresOnFromDays(config.auth.refreshTokenExpirationInDays);

		const newRefreshToken = {
			token: this.generateRefreshToken(),
			deviceId,
			userId,
			expiresOn: expiresOn,
			created: moment().utc().toDate(),
			createdBy: userId
		};

		// delete all other refreshTokens with the same deviceId
		//  todo: At some point, we will need to have a scheduled service go through and delete all expired refreshTokens because
		//   many will probably just expire without ever having anyone re-login on that device.
		const deleteResult = await this.deleteRefreshTokensForDevice(deviceId)
		const insertResult = await this.refreshTokensCollection.insertOne(newRefreshToken);
		let tokenResult = null;
		if (insertResult.insertedId) {  // presence of an insertedId means the insert was successful
			tokenResult = newRefreshToken;
		}
		return tokenResult;
	}

	async sendResetPasswordEmail(emailAddress: string) {
		// create passwordResetToken
		const expiresOn = this.getExpiresOnFromMinutes(config.auth.passwordResetTokenExpirationInMinutes);
		const passwordResetToken = await this.passwordResetTokenService.createPasswordResetToken(emailAddress, expiresOn);
		
		// Check if password reset token was created successfully
		if (!passwordResetToken) {
			throw new ServerError(`Failed to create password reset token for email: ${emailAddress}`);
		}

		// create reset password link
		const httpOrHttps = config.env === 'local' ? 'http' : 'https';
		const urlEncodedEmail = encodeURIComponent(emailAddress);
		const clientUrl = config.hostName
		const resetPasswordLink = `${httpOrHttps}://${clientUrl}/reset-password/${passwordResetToken.token}/${urlEncodedEmail}`;

		const htmlEmailBody = `<strong><a href="${resetPasswordLink}">Reset Password</a></strong>`;
		await this.emailService.sendHtmlEmail(emailAddress, `Reset Password for ${config.appName}`, htmlEmailBody);
	}

	async resetPassword(email: string, passwordResetToken: string, password: string): Promise<UpdateResult> {
		const lowerCaseEmail = email.toLowerCase();
		// fetch passwordResetToken
		const retrievedPasswordResetToken = await this.passwordResetTokenService.getByEmail(lowerCaseEmail);
		
		// Check if token exists
		if (!retrievedPasswordResetToken) {
			throw new ServerError(`Unable to retrieve password reset token for email: ${lowerCaseEmail}`);
		}
		
		// Validate they sent the same token that we have saved for this email (there can only be one) and that it hasn't expired
		if (retrievedPasswordResetToken.token !== passwordResetToken || retrievedPasswordResetToken.expiresOn < Date.now()) {
			throw new BadRequestError('Invalid password reset token');
		}

		// update user password
		const result = await this.changePassword(EmptyUserContext, {email: lowerCaseEmail}, password);
		console.log(`password changed using forgot-password for email: ${lowerCaseEmail}`);

		// delete passwordResetToken
		// todo: should we await here? I think we should not. The user successfully changed their password regardless of what happens to the resetToken
		await this.passwordResetTokenService.deleteById(EmptyUserContext, retrievedPasswordResetToken._id.toString());
		console.log(`passwordResetToken deleted for email: ${lowerCaseEmail}`);

		return result;
	}

	deleteRefreshTokensForDevice(deviceId: string) {
		return this.refreshTokensCollection.deleteMany({deviceId: deviceId});
	}

	generateJwt(payload: any) {
		// Ensure orgId is a string before signing to prevent type inconsistencies when deserializing
		if (payload._orgId !== undefined) {
			payload._orgId = String(payload._orgId);
		}
		
		// generate the jwt (uses jsonwebtoken library)
		const jwtExpiryConfig = config.auth.jwtExpirationInSeconds;
		const jwtExpirationInSeconds = (typeof jwtExpiryConfig === 'string') ? parseInt(jwtExpiryConfig) : jwtExpiryConfig;

		const accessToken = JwtService.sign(
			payload,
			config.clientSecret,
			{
				expiresIn: jwtExpirationInSeconds
			}
		);
		return accessToken;
	};

	generateRefreshToken() {
		return crypto.randomBytes(40).toString('hex');
	}

	generateDeviceId() {
		return crypto.randomBytes(40).toString('hex');
	}

	getAndSetDeviceIdCookie(req: Request, res: Response) {
		let isNewDeviceId = false;
		let deviceId = '';
		const deviceIdFromCookie = this.getDeviceIdFromCookie(req);

		if (deviceIdFromCookie) {
			deviceId = deviceIdFromCookie;
		} else {
			deviceId = this.generateDeviceId();
			isNewDeviceId = true;
			// todo: send out an email telling the user that there was a login from a new device
			//const htmlEmailBody = `There has been a login from a new device. If this was not you, please reset your password immediately.`;
			//this.emailService.sendHtmlEmail(emailAddress, 'Reset Password for Risk Answers', htmlEmailBody);
		}

		if (isNewDeviceId) {
			// save deviceId as cookie on response
			const cookieOptions: any = {
				maxAge: config.auth.deviceIdCookieMaxAgeInDays * 24 * 60 * 60 * 1000,
				httpOnly: true
			};
			
			// save deviceId as cookie on response
			res.cookie('deviceId', deviceId, cookieOptions);
		}

		return deviceId;
	}

	getDeviceIdFromCookie(req: Request) {
		//console.log(`req.cookies: ${JSON.stringify(req.cookies)}`); // todo: delete me
		return req.cookies['deviceId'];
	}

	getExpiresOnFromSeconds(expiresInSeconds: number) {
		// exactly when the token expires (in milliseconds since Jan 1, 1970 UTC)
		return Date.now() + expiresInSeconds * 1000;
	}

	getExpiresOnFromMinutes(expiresInMinutes: number) {
		// exactly when the token expires (in milliseconds since Jan 1, 1970 UTC)
		return Date.now() + expiresInMinutes * 60 * 1000
	}

	getExpiresOnFromDays(expiresInDays: number) {
		// exactly when the token expires (in milliseconds since Jan 1, 1970 UTC)
		return Date.now() + expiresInDays * 24 * 60 * 60 * 1000
	}

	override async prepareEntity(userContext: IUserContext, entity: IUser | Partial<IUser>, isCreate: boolean): Promise<IUser | Partial<IUser>> {
		if (entity.email) {
			// lowercase the email
			entity.email = entity.email!.toLowerCase();
		}

		if (entity.password) {
			const hash = await passwordUtils.hashPassword(entity.password!);
			entity.password = hash;
		}

		// Need to set default roles if new user created without a role.
		if (isCreate && !entity.roles) {
			entity.roles = ["user"];
		}
		
		const preparedEntity = await super.prepareEntity(userContext, entity, isCreate);
		return preparedEntity;
	}
	
	override transformList(users: IUser[]) {
		return super.transformList(users);
	}

	override transformSingle(user: IUser) {
		return super.transformSingle(user);
	}

	/**
	 * Updates the user's lastLoggedIn date to the current time
	 * This is designed to be called in a non-blocking way
	 * @param userId The ID of the user to update
	 */
	private async updateLastLoggedIn(userId: string): Promise<void> {
		try {
			if (!entityUtils.isValidObjectId(userId)) {
				throw new BadRequestError('userId is not a valid ObjectId');
			}

			const updates = { _lastLoggedIn: moment().utc().toDate() };
			
			await this.partialUpdateById(EmptyUserContext, userId, updates);
		} catch (error) {
			// Log error but don't throw to ensure non-blocking behavior
			console.log(`Failed to update lastLoggedIn for user ${userId}: ${error}`);
		}
	}

}
