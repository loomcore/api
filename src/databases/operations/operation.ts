import { LeftJoin } from "./left-join.operation.js";
import { LeftJoinMany } from "./left-join-many.operation.js";
import { InnerJoin } from "./inner-join.operation.js";

export type Operation = LeftJoin | InnerJoin | LeftJoinMany