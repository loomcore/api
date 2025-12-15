import { IUser, IUserContextAuthorization } from "@loomcore/common/models";
import { PostgresDatabase } from "../../databases/postgres/postgres.database.js";
import { IDatabase } from "../../databases/models/index.js";

export async function getUserContextAuthorizations(database: IDatabase, user: IUser): Promise<IUserContextAuthorization[]> {
    // For now only fetch authorizations if using PostgresDatabase
    if (!(database instanceof PostgresDatabase)) {
        return [];
    }

    const orgId = user._orgId;
    const authorizations = await (database as PostgresDatabase).getUserAuthorizations(user._id, orgId);

    return authorizations;
}