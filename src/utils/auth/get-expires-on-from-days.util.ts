export function getExpiresOnFromDays(expiresInDays: number) {
	return Date.now() + expiresInDays * 24 * 60 * 60 * 1000;
}
