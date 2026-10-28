export type ClassifiedFilterKey =
  | { type: 'root' }
  | { type: 'join'; aliases: string[]; column: string; crossesMany: boolean };
