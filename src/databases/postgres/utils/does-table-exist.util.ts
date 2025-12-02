import { Client } from "pg";

export async function doesTableExist(client: Client, tableName: string): Promise<boolean> {
    const result = await client.query(`
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1
        )
    `, [tableName]);
    return result.rows[0].exists;
}