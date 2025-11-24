export interface IMigration {
    id: number,
    execute(): Promise<boolean>;
    revert(): Promise<boolean>;
}
