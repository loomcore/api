import { LeftJoin } from "./left-join.operation.js";
import { InnerJoin } from "./inner-join.operation.js";
import { LeftJoinMany } from "./left-join-many.operation.js";
import { Operation } from "./operation.js";

export type JoinOperation = LeftJoin | InnerJoin | LeftJoinMany;