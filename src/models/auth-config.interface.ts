export interface IAuthConfig {
    clientSecret: string;
    saltWorkFactor: number;
    deviceIdCookieMaxAgeInDays: number;
    jwtExpirationInSeconds: number;
    passwordResetTokenExpirationInMinutes: number;
    refreshTokenExpirationInDays: number;
}