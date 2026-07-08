export function getExpiresOnFromMinutes(expiresInMinutes: number) {
	return Date.now() + expiresInMinutes * 60 * 1000;
}
