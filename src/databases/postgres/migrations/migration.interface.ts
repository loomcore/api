import { IEntity } from "@loomcore/common/models";

export interface IMigration {
    index: number,
    execute(): Promise<{ success: boolean, error: Error | null }>;
    revert(): Promise<{ success: boolean, error: Error | null }>;
}
