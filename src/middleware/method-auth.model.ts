/** `true` = any authenticated user; `string[]` = must have one of these features. */
export type FeatureRequirement = true | string[];

/**
 * Per-HTTP-method authorization for a route or controller.
 * Missing buckets deny (fail closed). Admin feature bypasses all checks.
 */
export interface MethodAuth {
	read?: FeatureRequirement;
	create?: FeatureRequirement;
	update?: FeatureRequirement;
	delete?: FeatureRequirement;
}

/** Authenticated user may perform all CRUD methods. */
export const authenticated: MethodAuth = {
	read: true,
	create: true,
	update: true,
	delete: true,
};

/** Authenticated reads; create/update/delete require admin. */
export const adminWrites: MethodAuth = {
	read: true,
	create: ["admin"],
	update: ["admin"],
	delete: ["admin"],
};
