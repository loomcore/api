import { InnerJoin } from "../operations/inner-join.operation.js";
import { type JoinOperation } from "../operations/join-operation.js";
import { LeftJoin } from "../operations/left-join.operation.js";
import { LeftJoinMany } from "../operations/left-join-many.operation.js";
import { type Operation } from "../operations/operation.js";

export function isJoinOperation(operation: Operation): operation is JoinOperation {
    return operation instanceof LeftJoin || operation instanceof InnerJoin || operation instanceof LeftJoinMany;
}