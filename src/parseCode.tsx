import { parseScript } from "esprima";
import { generate } from "escodegen";
import type * as T from "estree";

export type ThreadFunction = (
    threadId: number,
    globals: unknown,
    waitForTick: (
        threadId: number,
        locals: Record<string, unknown>,
        lineNo: number
    ) => Promise<void>
) => Promise<void>;

export function parseCode(code: string): ThreadFunction {
    const ast = parseScript(code, { loc: true });

    if (!ensureBodyNodesAreStatements(ast.body)) {
        throw new Error("Invalid syntax, cannot use directives or import/export statements");
    }

    ast.body = ast.body.flatMap(visitStmt);

    if (!ensureBodyNodesAreStatements(ast.body)) {
        throw new Error("Invalid syntax, cannot use directives or import/export statements");
    }

    ast.body = [wrapBodyInMainAsyncFunction(ast.body)];

    const fullCode = generate(ast);
    console.log(fullCode);
    const thread = eval(fullCode) as ThreadFunction;

    return thread;
}

function ensureBodyNodesAreStatements(nodes: (T.Directive | T.Statement | T.ModuleDeclaration)[]): nodes is T.Statement[] {
    for (const node of nodes) {
        if (node.type === "ExpressionStatement" && "directive" in node) {
            const directive: T.Directive = node;
            return false;
        }

        if (node.type === "ImportDeclaration" || node.type === "ExportNamedDeclaration" || node.type === "ExportDefaultDeclaration" || node.type === "ExportAllDeclaration") {
            const modDec: T.ModuleDeclaration = node;
            return false;
        }

        const stmt: T.Statement = node;
    }

    return true;
}

function wrapBodyInMainAsyncFunction(stmts: T.Statement[]): T.ExpressionStatement {
    const funcWrapper: T.ExpressionStatement = {
        type: "ExpressionStatement",
        expression: {
            type: "ArrowFunctionExpression",
            generator: false,
            expression: false,
            async: true,
            params: [
                { type: "Identifier", name: "threadId" },
                { type: "Identifier", name: "globals" },
                { type: "Identifier", name: "waitForTick" }
            ],
            body: {
                type: "BlockStatement",
                body: stmts
            }
        }
    }

    return funcWrapper;
}

function callWaitForTick(lineNo: number): T.CallExpression {
    return {
        type: "CallExpression",
        callee: {
            type: "Identifier",
            name: "waitForTick"
        },
        arguments: [
            { type: "Identifier", name: "threadId" },
            { type: "ObjectExpression", properties: [] },
            { type: "Literal", value: lineNo, raw: lineNo.toString() }
        ],
        optional: false,
    }
}

function awaitCallWaitForTick(lineNo: number): T.AwaitExpression {
    return {
        type: "AwaitExpression",
        argument: callWaitForTick(lineNo)
    }
}

function wrapExprInStmt(expr: T.Expression): T.ExpressionStatement {
    return {
        type: "ExpressionStatement",
        expression: expr,
    };
}

function wrapExprInAwaitForTickSequenceExpr(expr: T.Expression): T.SequenceExpression {
    return {
        type: "SequenceExpression",
        expressions: [
            awaitCallWaitForTick(expr.loc!.start.line - 1),
            expr,
        ],
    };
}

function awaitForTickStmt(lineNo: number): T.ExpressionStatement {
    return wrapExprInStmt(awaitCallWaitForTick(lineNo));
}

function prefixStmtWithAwaitForTickStmt(stmt: T.Statement): T.Statement[] {
    return [awaitForTickStmt(stmt.loc!.start.line - 1), stmt];
}

function wrapStmtsInBlock(stmts: T.Statement[]): T.BlockStatement {
    return {
        type: "BlockStatement",
        body: stmts,
    };
}

function visitStmt(stmt: T.Statement): T.Statement[] {
    if (stmt.type === "ExpressionStatement") {
        return prefixStmtWithAwaitForTickStmt(stmt);

    } else if (stmt.type === "BlockStatement") {
        stmt.body = stmt.body.flatMap(visitStmt);
        return [stmt];

    } else if (stmt.type === "EmptyStatement") {
        return prefixStmtWithAwaitForTickStmt(stmt);

    } else if (stmt.type === "DebuggerStatement") {
        return prefixStmtWithAwaitForTickStmt(stmt);

    } else if (stmt.type === "WithStatement") {
        stmt.body = wrapStmtsInBlock(visitStmt(stmt.body));
        return prefixStmtWithAwaitForTickStmt(stmt);

    } else if (stmt.type === "ReturnStatement") {
        return prefixStmtWithAwaitForTickStmt(stmt);

    } else if (stmt.type === "LabeledStatement") {
        throw new Error("Not implemented");
        
    } else if (stmt.type === "BreakStatement") {
        return prefixStmtWithAwaitForTickStmt(stmt);

    } else if (stmt.type === "ContinueStatement") {
        return prefixStmtWithAwaitForTickStmt(stmt);

    } else if (stmt.type === "IfStatement") {
        stmt.consequent = wrapStmtsInBlock(visitStmt(stmt.consequent));
        stmt.alternate = stmt.alternate ? wrapStmtsInBlock(visitStmt(stmt.alternate)) : stmt.alternate;
        return prefixStmtWithAwaitForTickStmt(stmt);

    } else if (stmt.type === "SwitchStatement") {
        throw new Error("Not implemented");
        
    } else if (stmt.type === "ThrowStatement") {
        return prefixStmtWithAwaitForTickStmt(stmt);

    } else if (stmt.type === "TryStatement") {
        stmt.block.body = stmt.block.body.flatMap(visitStmt);
        if (stmt.handler) {
            stmt.handler.body.body = stmt.handler.body.body.flatMap(visitStmt);
        }
        if (stmt.finalizer) {
            stmt.finalizer.body = stmt.finalizer.body.flatMap(visitStmt);
        }
        return prefixStmtWithAwaitForTickStmt(stmt);

    } else if (stmt.type === "WhileStatement") {
        stmt.test = wrapExprInAwaitForTickSequenceExpr(stmt.test);
        stmt.body = wrapStmtsInBlock(visitStmt(stmt.body));
        return [stmt];
        
    } else if (stmt.type === "DoWhileStatement") {
        stmt.test = wrapExprInAwaitForTickSequenceExpr(stmt.test);
        stmt.body = wrapStmtsInBlock(visitStmt(stmt.body));
        return [stmt];
        
    } else if (stmt.type === "ForStatement") {
        if (stmt.test) {
            stmt.test = wrapExprInAwaitForTickSequenceExpr(stmt.test);
        }
        if (stmt.update) {
            stmt.update = wrapExprInAwaitForTickSequenceExpr(stmt.update);
        }
        stmt.body = wrapStmtsInBlock(visitStmt(stmt.body));

        return prefixStmtWithAwaitForTickStmt(stmt);
        
    } else if (stmt.type === "ForInStatement") {
        stmt.body = wrapStmtsInBlock(visitStmt(stmt.body));
        return prefixStmtWithAwaitForTickStmt(stmt);
        
    } else if (stmt.type === "ForOfStatement") {
        stmt.body = wrapStmtsInBlock(visitStmt(stmt.body));
        return prefixStmtWithAwaitForTickStmt(stmt);
        
    } else if (stmt.type === "FunctionDeclaration") {
        stmt.async = true;
        stmt.body.body = stmt.body.body.flatMap(visitStmt);
        return [stmt];
        
    } else if (stmt.type === "VariableDeclaration") {
        return prefixStmtWithAwaitForTickStmt(stmt);
        
    } else if (stmt.type === "ClassDeclaration") {
        throw new Error("Not implemented");
        
    } else {
        const exhaustive: never = stmt;
        throw new Error("Exhaustive check failed: " + JSON.stringify(exhaustive));
    }
}
