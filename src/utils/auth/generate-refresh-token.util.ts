import crypto from "node:crypto";

export function generateRefreshToken() {
	return crypto.randomBytes(40).toString("hex");
}
