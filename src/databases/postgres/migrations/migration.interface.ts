import { IEntity } from "@loomcore/common/models";

export interface IMigration extends IEntity {
    index: number,
    execute(): Promise<boolean>;
    revert(): Promise<boolean>;
}
