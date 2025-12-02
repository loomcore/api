import { IEntity } from "@loomcore/common/models";

export interface IMigration extends IEntity {
    index: number,
    execute(): Promise<{success: boolean, error: Error | null}>;
    revert(): Promise<{success: boolean, error: Error | null}>;
}
