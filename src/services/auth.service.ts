import { Request, Response } from 'express';
import moment from 'moment';
import crypto from 'crypto';
import { IUserContext, ITokenResponse, EmptyUserContext, passwordValidator, UserSpec, ILoginResponse, getSystemUserContext, PublicUserSpec, IUser } from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import { entityUtils } from '@loomcore/common/utils';

import { BadRequestError, ServerError, NotFoundError } from '../errors/index.js';
import { JwtService, EmailService } from './index.js';
import { GenericApiService } from './generic-api-service/generic-api.service.js';
import { MultiTenantApiService } from './multi-tenant-api.service.js';
import { PasswordResetTokenService } from './password-reset-token.service.js';
import { OrganizationService } from './organization.service.js';
import { passwordUtils } from '../utils/index.js';
import { config } from '../config/index.js';
import { UpdateResult } from '../databases/models/update-result.js';
import { IRefreshToken, refreshTokenModelSpec } from '../models/refresh-token.model.js';
import { IDatabase } from '../databases/models/index.js';
import { getUserContextAuthorizations } from './utils/getUserContextAuthorizations.util.js';
import { IAuthConfig } from '../models/auth-config.interface.js';
export class AuthService extends MultiTenantApiService<IUser> {
    private refreshTokenService: GenericApiService<IRefreshToken>;
    private passwordResetTokenService: PasswordResetTokenService;
    private emailService: EmailService;
    private organizationService: OrganizationService;
    private authConfig: IAuthConfig;
    constructor(database: IDatabase) {
        super(database, 'users', 'user', UserSpec);
        this.refreshTokenService = new GenericApiService<IRefreshToken>(database, 'refresh_tokens', 'refresh_token', refreshTokenModelSpec);
        this.passwordResetTokenService = new PasswordResetTokenService(database);
        this.emailService = new EmailService();
        this.organizationService = new OrganizationService(database);
        if (!config.auth) {
            throw new ServerError('Auth configuration is not set');
        }
        this.authConfig = config.auth;
    }

    async attemptLogin(req: Request, res: Response, email: string, password: string): Promise<ILoginResponse | null> {
        const lowerCaseEmail = email.toLowerCase();
        const user = await this.getUserByEmail(lowerCaseEmail);
        const organization = await this.organizationService.findOne(EmptyUserContext, { filters: { _id: { eq: user?._orgId } } });

        // Basic validation to prevent errors with undefined user
        if (!user) {
            throw new BadRequestError('Invalid Credentials');
        }

        const passwordsMatch = await passwordUtils.comparePasswords(user.password!, password);
        if (!passwordsMatch) {
            throw new BadRequestError('Invalid Credentials');
        }

        const authorizations = await getUserContextAuthorizations(this.database, user);
        const userContext = {
            user: user,
            organization: organization ?? undefined,
            authorizations: authorizations
        };

        const deviceId = this.getAndSetDeviceIdCookie(req, res);
        const loginResponse = await this.logUserIn(userContext, deviceId);
        return loginResponse;
    }

    async logUserIn(userContext: IUserContext, deviceId: string) {
        const payload = userContext;
        const accessToken = this.generateJwt(payload);

        // Every time there's a successful cred swap, we start with a brand new refreshToken.
        const refreshTokenObject = await this.createNewRefreshToken(userContext.user._id, deviceId, userContext.organization?._id);
        const accessTokenExpiresOn = this.getExpiresOnFromSeconds(this.authConfig.jwtExpirationInSeconds);

        let loginResponse = null;
        if (refreshTokenObject) {
            const tokenResponse = {
                accessToken,
                refreshToken: refreshTokenObject.token,
                expiresOn: accessTokenExpiresOn
            };

            // Update lastLoggedIn in a non-blocking way
            this.updateLastLoggedIn(userContext.user._id!)
                .catch(err => console.log(`Error updating lastLoggedIn: ${err}`));

            userContext.user = this.postProcessEntity(userContext, userContext.user);
            loginResponse = { tokens: tokenResponse, userContext };
        }

        return loginResponse;
    }

    async getUserByEmail(email: string): Promise<IUser | null> {
        // Query database directly to bypass tenant filtering for global email uniqueness check
        // Email addresses must be unique across all tenants, so we can't use tenant-filtered queries
        const queryOptions = { filters: { email: { eq: email.toLowerCase() } } };
        const rawUser = await this.database.findOne<IUser>(queryOptions, 'users');
        if (!rawUser) {
            return null;
        }

        return this.database.postProcessEntity(rawUser, this.modelSpec.fullSchema);
    }

    async createUser(userContext: IUserContext, user: Partial<IUser>): Promise<IUser | null> {
        // prepareEntity handles hashing the password, lowercasing the email, and other entity transformations before any create or update.

        if (userContext.user._id === 'system') {
            if (config.app.isMultiTenant && userContext.organization?._id !== user._orgId) {
                throw new BadRequestError('User is not authorized to create a user in this organization');
            }
            // Check if organization exists when _orgId is provided
            if (user._orgId) {
                const org = await this.organizationService.findOne(userContext, { filters: { _id: { eq: user._orgId } } });
                if (!org) {
                    throw new BadRequestError('The specified organization does not exist');
                }
            }
        }

        // Check if email already exists across all organizations
        if (user.email) {
            const existingUser = await this.getUserByEmail(user.email);
            if (existingUser) {
                throw new BadRequestError('A user with this email address already exists');
            }
        }

        return await this.create(userContext, user);
    }

    async requestTokenUsingRefreshToken(refreshToken: string, deviceId: string): Promise<ITokenResponse | null> {
        let tokens: ITokenResponse | null = null;
        const activeRefreshToken = await this.getActiveRefreshToken(refreshToken, deviceId);
        if (activeRefreshToken) {
            const systemUserContext = getSystemUserContext();
            const user = await this.getById(systemUserContext, activeRefreshToken.userId);
            const organization = await this.organizationService.findOne(EmptyUserContext, { filters: { _id: { eq: user?._orgId } } });
            const authorizations = await getUserContextAuthorizations(this.database, user);
            const userContext: IUserContext = {
                user: user,
                organization: organization ?? undefined,
                authorizations: authorizations
            };
            tokens = await this.createNewTokens(userContext, activeRefreshToken);
        }
        return tokens;
    }

    async changeLoggedInUsersPassword(userContext: IUserContext, body: any) {
        const queryObject = { _id: userContext.user._id };
        const result = await this.changePassword(userContext, queryObject, body.password);
        return result;
    }

    async changePassword(userContext: IUserContext, queryObject: any, password: string): Promise<UpdateResult> {
        // Note: We pass the plain password here - prepareEntity will hash it
        const updates = { password: password, _lastPasswordChange: moment().utc().toDate() };
        const updatedUsers = await super.update(userContext, queryObject, updates as Partial<IUser>);

        const result: UpdateResult = {
            success: true,
            count: updatedUsers.length,
        };

        return result;
    }

    async createNewTokens(userContext: IUserContext, activeRefreshToken: IRefreshToken) {
        const payload = userContext;
        const accessToken = this.generateJwt(payload);
        const accessTokenExpiresOn = this.getExpiresOnFromSeconds(this.authConfig.jwtExpirationInSeconds);
        const tokenResponse = {
            accessToken,
            refreshToken: activeRefreshToken.token,
            expiresOn: accessTokenExpiresOn
        };

        return tokenResponse;
    }

    async getActiveRefreshToken(refreshToken: string, deviceId: string) {
        const refreshTokenResult = await this.refreshTokenService.findOne(EmptyUserContext, { filters: { token: { eq: refreshToken }, deviceId: { eq: deviceId } } });
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

    async createNewRefreshToken(userId: AppIdType, deviceId: string, orgId?: AppIdType) {
        const expiresOn = this.getExpiresOnFromDays(this.authConfig.refreshTokenExpirationInDays);

        const newRefreshToken: Partial<IRefreshToken> = {
            _orgId: orgId,
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
        const insertResult = await this.refreshTokenService.create(EmptyUserContext, newRefreshToken);
        return insertResult;
    }

    async sendResetPasswordEmail(emailAddress: string) {
        // create passwordResetToken
        const expiresOn = this.getExpiresOnFromMinutes(this.authConfig.passwordResetTokenExpirationInMinutes);
        const passwordResetToken = await this.passwordResetTokenService.createPasswordResetToken(emailAddress, expiresOn);

        // Check if password reset token was created successfully
        if (!passwordResetToken) {
            throw new ServerError(`Failed to create password reset token for email: ${emailAddress}`);
        }

        // create reset password link
        const httpOrHttps = config.env === 'local' ? 'http' : 'https';
        const urlEncodedEmail = encodeURIComponent(emailAddress);
        const resetPasswordLink = `${httpOrHttps}://${config.app.name}/reset-password/${passwordResetToken.token}/${urlEncodedEmail}`;

        const htmlEmailBody = `<strong><a href="${resetPasswordLink}">Reset Password</a></strong>`;
        await this.emailService.sendHtmlEmail(emailAddress, `Reset Password for ${config.app.name}`, htmlEmailBody);
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

        // Validate password before attempting to change it
        const validationErrors = entityUtils.validate(passwordValidator, { password: password });
        entityUtils.handleValidationResult(validationErrors, 'AuthService.resetPassword');

        // update user password
        const result = await this.changePassword(getSystemUserContext(), { email: lowerCaseEmail }, password);
        console.log(`password changed using forgot-password for email: ${lowerCaseEmail}`);

        // delete passwordResetToken
        // todo: should we await here? I think we should not. The user successfully changed their password regardless of what happens to the resetToken
        await this.passwordResetTokenService.deleteById(EmptyUserContext, retrievedPasswordResetToken._id.toString());
        console.log(`passwordResetToken deleted for email: ${lowerCaseEmail}`);

        return result;
    }

    deleteRefreshTokensForDevice(deviceId: string) {
        return this.refreshTokenService.deleteMany(EmptyUserContext, { filters: { deviceId: { eq: deviceId } } });
    }

    generateJwt(userContext: IUserContext) {
        const jwtExpiryConfig = this.authConfig.jwtExpirationInSeconds;
        const jwtExpirationInSeconds = (typeof jwtExpiryConfig === 'string') ? parseInt(jwtExpiryConfig) : jwtExpiryConfig;

        const accessToken = JwtService.sign(
            userContext,
            this.authConfig.clientSecret,
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
                maxAge: this.authConfig.deviceIdCookieMaxAgeInDays * 24 * 60 * 60 * 1000,
                httpOnly: true
            };

            // save deviceId as cookie on response
            res.cookie('deviceId', deviceId, cookieOptions);
        }

        return deviceId;
    }

    getDeviceIdFromCookie(req: Request) {
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

    override async preProcessEntity(userContext: IUserContext, entity: Partial<IUser>, isCreate: boolean, allowId: boolean): Promise<Partial<IUser>> {
        if (entity.email) {
            // lowercase the email
            entity.email = entity.email!.toLowerCase();
        }

        if (entity.password) {
            const hash = await passwordUtils.hashPassword(entity.password!);
            entity.password = hash;
        }

        const preparedEntity = await super.preProcessEntity(userContext, entity, isCreate, allowId);
        return preparedEntity;
    }

    /**
     * Updates the user's lastLoggedIn date to the current time
     * This is designed to be called in a non-blocking way
     * @param userId The ID of the user to update
     */
    private async updateLastLoggedIn(userId: AppIdType): Promise<void> {
        try {
            const updates: Partial<IUser> = { _lastLoggedIn: moment().utc().toDate() };
            const systemUserContext = getSystemUserContext();
            await this.partialUpdateById(systemUserContext, userId, updates);
        } catch (error) {

        }
    }
}
