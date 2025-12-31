export interface IAuthConfig {
    adminUser: {
        email: string;
        password: string;
    };
    clientSecret: string;
    saltWorkFactor: number;
    deviceIdCookieMaxAgeInDays: number;
    jwtExpirationInSeconds: number;
    passwordResetTokenExpirationInMinutes: number;
    refreshTokenExpirationInDays: number;
}