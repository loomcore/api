import type { CookieOptions, Request, Response } from "express";
import { generateDeviceId } from "./generate-device-id.util.js";
import { getAuthConfig } from "./get-auth-config.util.js";
import { getDeviceIdFromCookie } from "./get-device-id-from-cookie.util.js";

export function getAndSetDeviceIdCookie(req: Request, res: Response) {
	let deviceId: string;
	const deviceIdFromCookie = getDeviceIdFromCookie(req);
	const isNewDeviceId = !deviceIdFromCookie;
	if (deviceIdFromCookie) {
		deviceId = deviceIdFromCookie;
	} else {
		deviceId = generateDeviceId();
	}

	if (isNewDeviceId) {
		const authConfig = getAuthConfig();
		const cookieOptions: CookieOptions = {
			maxAge: authConfig.deviceIdCookieMaxAgeInDays * 24 * 60 * 60 * 1000,
			httpOnly: true,
		};

		res.cookie("deviceId", deviceId, cookieOptions);
	}

	return deviceId;
}
