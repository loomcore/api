export function getExpiresOnFromSeconds(expiresInSeconds: number) {
	return Date.now() + expiresInSeconds * 1000;
}
