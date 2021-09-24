import { parseCode, ThreadFunction } from "./parseCode";

export class Simulator {
    private parsedFunction: ThreadFunction;
    public readonly parsedGlobals: Record<string, unknown>;

    private threadTickPromises: Promise<void>[];
    private threadTickResolvers: ((obj: void) => void)[];

    public readonly threadPositions: number[];
    public readonly threadLocals: Record<string, unknown>[];

    public constructor(
        public readonly threadCount: number,
        public readonly globals: string,
        public readonly code: string,
    ) {
        this.parsedFunction = parseCode(code);
        this.parsedGlobals = JSON.parse(globals);
        
        this.threadTickPromises = [];
        this.threadTickResolvers = [];
        for (let i = 0; i < threadCount; i++) {
            this.newTickPromise(i);
        }

        this.threadPositions = new Array(threadCount).fill(0, 0, threadCount);
        this.threadLocals = new Array(threadCount).fill(0, 0, threadCount);
    }

    private newTickPromise(threadId: number): void {
        this.threadTickPromises[threadId] = new Promise((res) => {
            this.threadTickResolvers[threadId] = res;
        });
    }

    public async tickThread(threadId: number): Promise<Simulator> {
        const newSim = this.clone();
        await newSim.internalTickThread(threadId);
        return newSim;
    }

    private internalTickThread(threadId: number): Promise<void> {
        const oldPromise = this.threadTickPromises[threadId];

        this.threadTickResolvers[threadId]();
        this.newTickPromise(threadId);
        
        return oldPromise;
    }

    public waitForTick(threadId: number, locals: Record<string, unknown>, lineNo: number): Promise<void> {
        this.threadPositions[threadId] = lineNo;
        this.threadLocals[threadId] = locals;
        return this.threadTickPromises[threadId];
    }

    public start(): void {
        for (let i = 0; i < this.threadCount; i++) {
            this.parsedFunction(i, this.parsedGlobals, this.waitForTick.bind(this)).then(
                succ => {
                    this.threadPositions[i] = Number.MAX_SAFE_INTEGER;
                    console.log("Thread finished", succ);
                },
                err => console.error("Thread failed!", err)
            );
        }
    }

    private clone(): Simulator {
        const copy = Object.create(Simulator.prototype) as any;

        copy.parsedFunction = this.parsedFunction;
        copy.parsedGlobals = this.parsedGlobals;
        copy.threadTickPromises = this.threadTickPromises;
        copy.threadTickResolvers = this.threadTickResolvers;
        copy.threadPositions = this.threadPositions;
        copy.threadLocals = this.threadLocals;
        copy.threadCount = this.threadCount;
        // copy.globals = this.globals;
        copy.code = this.code;

        if (!arrSameItems(Object.keys(copy), Object.keys(this))) {
            throw new Error("Forgot to update Simulator.clone()?")
        }

        return copy;
    }
}

function arrSameItems<T>(a: T[], b: T[]): boolean {
    return a.every(ai => b.includes(ai));
}
