import { IEntity } from "@loomcore/common/models";

export interface IMigration {
    index: number,
    execute(_orgId?: string): Promise<{ success: boolean, error: Error | null }>;
    revert(_orgId?: string): Promise<{ success: boolean, error: Error | null }>;
}
