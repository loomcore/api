import crypto from "node:crypto";

export function generateDeviceId() {
	return crypto.randomBytes(40).toString("hex");
}
