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
    // This last call below tells the simulator our thread line number is no longer relevant.
    // But don't await it as that would keep the thread "alive" when there's nothing else after it.
    ast.body.push(wrapExprInStmt(callWaitForTick(Number.MAX_SAFE_INTEGER)));

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

function wrapCallExpressionInAwait(func: T.CallExpression): T.AwaitExpression {
    return {
        type: "AwaitExpression",
        argument: func
    };
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
        stmt.expression = visitExpr(stmt.expression);
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
        throwNotImplemented();
        
    } else if (stmt.type === "BreakStatement") {
        return prefixStmtWithAwaitForTickStmt(stmt);

    } else if (stmt.type === "ContinueStatement") {
        return prefixStmtWithAwaitForTickStmt(stmt);

    } else if (stmt.type === "IfStatement") {
        stmt.consequent = wrapStmtsInBlock(visitStmt(stmt.consequent));
        stmt.alternate = stmt.alternate ? wrapStmtsInBlock(visitStmt(stmt.alternate)) : stmt.alternate;
        return prefixStmtWithAwaitForTickStmt(stmt);

    } else if (stmt.type === "SwitchStatement") {
        throwNotImplemented();
        
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
        stmt.declarations = stmt.declarations.map(d => {
            d.init = d.init
                ? d.init = visitExpr(d.init)
                : d.init;

            return d;
        });

        return prefixStmtWithAwaitForTickStmt(stmt);
        
    } else if (stmt.type === "ClassDeclaration") {
        throwNotImplemented();
        
    } else {
        const exhaustive: never = stmt;
        throw new Error("Exhaustive check failed: " + JSON.stringify(exhaustive));
    }
}

function awaitCallOrVisitExpr(expr: T.Expression): T.Expression {
    expr = visitExpr(expr);

    if (expr.type === "CallExpression") {
        return wrapCallExpressionInAwait(expr);
    } else {
        return expr;
    }
}

function visitExpr(expr: T.Expression): T.Expression {
    if(expr.type === "ThisExpression") {
        // Nothing to do

    } else if(expr.type === "ArrayExpression") {
        expr.elements
            .map(arg =>
                  arg === null ? null
                : arg.type === "SpreadElement" ? arg.argument = awaitCallOrVisitExpr(arg.argument)
                : awaitCallOrVisitExpr(arg)
            );

    } else if(expr.type === "ObjectExpression") {
        throwNotImplemented();

    } else if(expr.type === "FunctionExpression") {
        expr.async = true;
        expr.body.body = expr.body.body.flatMap(visitStmt);

    } else if(expr.type === "ArrowFunctionExpression") {
        expr.async = true;
        expr.body = expr.body.type === "BlockStatement"
            ? visitStmt(expr.body)[0] as T.BlockStatement
            : visitExpr(expr.body);

    } else if(expr.type === "YieldExpression") {
        if (expr.argument) {
            expr.argument = awaitCallOrVisitExpr(expr.argument);
        }

    } else if(expr.type === "Literal") {
        // Nothing to do

    } else if(expr.type === "UnaryExpression") {
        expr.argument = awaitCallOrVisitExpr(expr.argument);

    } else if(expr.type === "UpdateExpression") {
        expr.argument = awaitCallOrVisitExpr(expr.argument);

    } else if(expr.type === "BinaryExpression") {
        expr.left = awaitCallOrVisitExpr(expr.left);
        expr.right = awaitCallOrVisitExpr(expr.right);

    } else if(expr.type === "AssignmentExpression") {
        expr.right = awaitCallOrVisitExpr(expr.right);

    } else if(expr.type === "LogicalExpression") {
        expr.left = awaitCallOrVisitExpr(expr.left);
        expr.right = awaitCallOrVisitExpr(expr.right);

    } else if(expr.type === "MemberExpression") {
        throwNotImplemented();

    } else if(expr.type === "ConditionalExpression") {
        expr.test = awaitCallOrVisitExpr(expr.test);
        expr.consequent = awaitCallOrVisitExpr(expr.consequent);
        expr.alternate = awaitCallOrVisitExpr(expr.alternate);

    } else if(expr.type === "CallExpression") {
        expr.arguments = expr.arguments
            .map(arg => arg.type === "SpreadElement"
                ? arg.argument = awaitCallOrVisitExpr(arg.argument)
                : awaitCallOrVisitExpr(arg)
            );

    } else if(expr.type === "NewExpression") {
        if (expr.callee.type !== "Super") {
            expr.callee = awaitCallOrVisitExpr(expr.callee);
        }

    } else if(expr.type === "SequenceExpression") {
        expr.expressions = expr.expressions.map(awaitCallOrVisitExpr);

    } else if(expr.type === "TemplateLiteral") {
        expr.expressions = expr.expressions.map(awaitCallOrVisitExpr);

    } else if(expr.type === "TaggedTemplateExpression") {
        expr.tag = awaitCallOrVisitExpr(expr.tag);
        expr = awaitCallOrVisitExpr(expr.quasi);

    } else if(expr.type === "ClassExpression") {
        throwNotImplemented();

    } else if(expr.type === "MetaProperty") {
        throwNotImplemented();

    } else if(expr.type === "Identifier") {
        // Nothing to do

    } else if(expr.type === "AwaitExpression") {
        expr.argument = awaitCallOrVisitExpr(expr.argument);

    } else if(expr.type === "ImportExpression") {
        expr.source = awaitCallOrVisitExpr(expr.source);

    } else if(expr.type === "ChainExpression") {
        throwNotImplemented();

    } else {        
        const exhaustive: never = expr;
        throw new Error("Exhaustive check failed: " + JSON.stringify(exhaustive));
    }

    return expr;
}

function throwNotImplemented(msg?: string): never {
    msg = msg ? " " + msg : msg;
    throw new Error(`Not implemented!${msg}`);
}
