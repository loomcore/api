import type { IUser } from "@loomcore/common/models";
import type { IDatabase } from "../../databases/models/index.js";
import { PostgresDatabase } from "../../databases/postgres/postgres.database.js";

export async function getUserContextFeatures(
	database: IDatabase,
	user: IUser,
): Promise<string[]> {
	// For now only fetch features if using PostgresDatabase
	if (!(database instanceof PostgresDatabase)) {
		return [];
	}

	const orgId = user._orgId;
	const features = await (
		database as PostgresDatabase
	).getUserFeatures(user._id, orgId);

	return features;
}
