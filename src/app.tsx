import React from "react";

import { SimulatorView } from "./simulatorView";
import { Simulator } from "./simulator";

const DEFAULT_THREAD_COUNT = 2;

const DEFAULT_GLOBALS = `{
    "currActions": ["B", "C"],
    "savedActions": ["A"]
}`;

const DEFAULT_CODE = `const allActions = [...globals.savedActions];

for (const action of globals.currActions) {
    allActions.push(action);
}

globals.savedActions = allActions;

globals.currActions = [];`;

interface AppProps {}

interface AppState {
    threadCount: number;
    globals: string;
    code: string;

    simulator: Simulator | undefined
}

export class App extends React.Component<AppProps, AppState> {
    state: AppState = {
        threadCount: DEFAULT_THREAD_COUNT,
        globals: DEFAULT_GLOBALS,
        code: DEFAULT_CODE,

        simulator: undefined,
    }

    render() {
        const { threadCount, globals, code, simulator, } = this.state;

        if (simulator) {
            return <>
                <button onClick={this.stopSimulation}>Stop Simulation</button>
                <SimulatorView simulator={simulator} onTickSimulator={this.onTickSimulator} />
            </>
        } else {
            return <>
                <Inputs
                    threadCount={threadCount} setThreadCount={this.setThreadCount}
                    globals={globals} setGlobals={this.setGlobals}
                    code={code} setCode={this.setCode}
                />
                <button onClick={this.startSimulation}>Start Simulation</button>
            </>;
        }
    }

    setThreadCount = (threadCount: number) => {
        this.setState({ threadCount });
    }

    setGlobals = (globals: string) => {
        this.setState({ globals });
    }

    setCode = (code: string) => {
        this.setState({ code });
    }

    startSimulation = () => {
        const simulator = new Simulator(
            this.state.threadCount,
            this.state.globals,
            this.state.code,
        );

        simulator.start();

        this.setState({ simulator });
    }

    stopSimulation = () => {
        this.setState({ simulator: undefined });
    }

    onTickSimulator = async (threadId: number) => {
        if (!this.state.simulator) { return; }

        const simulator = await this.state.simulator.tickThread(threadId);
        this.setState({ simulator });
    }
}

interface InputsProps {
    threadCount: number;
    setThreadCount: (threadCount: number) => void;
    
    globals: string;
    setGlobals: (globals: string) => void;
    
    code: string;
    setCode: (code: string) => void;
}

function Inputs({
    threadCount, setThreadCount,
    globals, setGlobals,
    code, setCode,
}: InputsProps) {
    return <div>
        <input type="number" value={threadCount} onChange={e => setThreadCount(e.target.valueAsNumber)}></input>
        <textarea placeholder="JSON object for globals" value={globals} onChange={e => setGlobals(e.target.value)} />
        <textarea placeholder="JS code" value={code} onChange={e => setCode(e.target.value)} />
    </div>;
}




// const tickerHolder = document.getElementById("tickerHolder")!;
// const threadTickerPromises: Promise<unknown>[] = [];
// for (let i = 0; i < THREAD_COUNT; i++) {
//     const btn = document.createElement("button");
//     btn.innerText = `Progress Thread ${i}`;
//     tickerHolder.appendChild(btn);

//     const promCb = (res: (v: unknown) => void) => {
//         btn.onclick = () => {
//             const newProm = new Promise(promCb);
//             threadTickerPromises[i] = newProm;
//             res(undefined);
//         };
//     };

//     threadTickerPromises.push(new Promise(promCb));
// }

// function threadTick(threadId: number, lineNum: number): Promise<unknown> {
//     console.log(threadId, "up to line", lineNum);
//     return threadTickerPromises[threadId];
// }

// const globals = JSON.parse(globalsCode);

// const threadFunc = parseCode(code);

// for (let i = 0; i < THREAD_COUNT; i++) {
//     threadFunc(i).then(
//         (res) => console.log("Thread finished successfully", res),
//         (err) => console.error("Thread failed", err),
//     );
// }
