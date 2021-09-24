export type ThreadFunction = (threadId: number, globals: unknown, waitForTick: (threadId: number, locals: Record<string, unknown>, lineNo: number) => Promise<void>) => Promise<void>;

export function parseCode(code: string): ThreadFunction {
    const localsInScopes: string[][] = [[]];
    
    const lines = ["async (threadId, globals, waitForTick) => {"];

    let lineNo = 0;
    for (let line of code.split("\n")) {
        const origLine = line;

        if (isStatement(origLine)) {
            line = `await waitForTick(threadId, ${locals(localsInScopes)}, ${lineNo}); ${line}`;
        }

        if (isStartBlock(origLine)) {
            localsInScopes.push([]);
        }

        if (isEndBlock(origLine)) {
            localsInScopes.pop();
        }

        const newLocal = declaredLocal(origLine);
        if (newLocal) {
            localsInScopes[localsInScopes.length - 1].push(newLocal);
        }

        lines.push(line);
        lineNo++;
    }

    lines.push("}");

    // var thread: ThreadFunction = () => { throw new Error("Thread function not overridden"); };
    const fullCode = lines.join("\n");
    console.log(fullCode);
    const thread = eval(fullCode) as ThreadFunction;

    return thread;
}

function isStatement(line: string): boolean {
    return line.trim().length !== 0 && !line.includes("function");
}

function locals(scopes: string[][]): string {
    const all = scopes.flat();
    return `{${all.map(l => `"${l}": ${l}`).join(",")}}`;
}

function declaredLocal(line: string): string | undefined {
    const re = /(?:const |let |var )([a-zA-Z0-9]+)/g;
    return re.exec(line)?.[1];
}

function isStartBlock(line: string): boolean {
    return line.includes("{");
}

function isEndBlock(line: string): boolean {
    return line.includes("}");
}
