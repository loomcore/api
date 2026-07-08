import type { Request } from "express";

export function getDeviceIdFromCookie(req: Request) {
	return req.cookies.deviceId;
}
