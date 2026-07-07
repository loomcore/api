import jwt from "jsonwebtoken";

export function signJwt(payload: any, secret: string, options: any): string {
	return jwt.sign(payload, secret, options);
}

export function verifyJwt(token: string, secret: string): any {
	if (!secret) {
		throw new Error("JWT secret is required for verification");
	}

	return jwt.verify(token, secret);
}
