import React from "react";
import { Simulator } from "./simulator";

interface Props {
    simulator: Simulator;
    onTickSimulator: (threadId: number) => void;
}

export function SimulatorView({ simulator, onTickSimulator }: Props) {
    return <div>
        <CodeWithThreadMarkers code={simulator.code} threadPositions={simulator.threadPositions} />
        <TickThreadButtons threadCount={simulator.threadCount} onTickThread={onTickSimulator} />
        <GlobalsView globals={simulator.parsedGlobals} />
        <LocalsView threadLocals={simulator.threadLocals} />
    </div>;
}

function threadsAtLine(threadPositions: number[], lineNo: number): number[] {
    const ids = [];

    for (let threadId = 0; threadId < threadPositions.length; threadId++) {
        if (threadPositions[threadId] === lineNo) { ids.push(threadId); }
    }

    return ids;
}

function CodeWithThreadMarkers({ code, threadPositions }: { code: string; threadPositions: number[]; }) {
    const lines = code.split("\n");

    return <div style={{ whiteSpace: "pre", fontFamily: "monospace" }}>
        {lines.map((line, lineNo) => {
            const threadsHere = threadsAtLine(threadPositions, lineNo);
            return <div key={lineNo}>
                <span style={{ display: "inline-block", width: "75px", textAlign: "right", paddingRight: "15px" }}>{threadsHere.join(",")}</span>
                <span style={{ display: "inline-block" }}>{line}</span>
            </div>;
        })
    }
    </div>;
}

function TickThreadButtons({ threadCount, onTickThread }: { threadCount: number; onTickThread: (threadId: number) => void; }) {
    const threadIds = [];
    for (let tId = 0; tId < threadCount; tId++) {
        threadIds.push(tId);
    }

    return <div>
        {threadIds.map(
            threadId =>
                <button key={threadId} onClick={() => onTickThread(threadId)}>
                    Progress Thread {threadId}
                </button>
        )}
    </div>
}

function GlobalsView({ globals }: { globals: Record<string, unknown>; }) {
    return <>
        <h2>Global variables</h2>
        <table style={{ borderCollapse: "collapse", border: "1px solid black" }}>
            <thead>
                <tr>
                    <th style={{ border: "1px solid black", padding: "3px" }}>Name</th>
                    <th style={{ border: "1px solid black", padding: "3px" }}>Value</th>
                </tr>
            </thead>
            <tbody>
                {Object.entries(globals).map(([k, v]) =>
                    <tr key={k}>
                        <td style={{ border: "1px solid black", padding: "3px" }} >{k}</td>
                        <td style={{ border: "1px solid black", padding: "3px" }} >{JSON.stringify(v)}</td>
                    </tr>
                )}
            </tbody>
        </table>
    </>;
}

function LocalsView({ threadLocals }: { threadLocals: Record<string, unknown>[] }) {
    const allLocals = [...new Set(threadLocals.flatMap(Object.keys))].sort();

    return <>
        <h2>Local variables in threads</h2>
        <table style={{ borderCollapse: "collapse", border: "1px solid black" }}>
            <thead>
                <tr>
                    <th style={{ border: "1px solid black", padding: "3px" }}>Thread ID</th>
                    {allLocals.map(name => <th style={{ border: "1px solid black", padding: "3px" }} key={name}>{name}</th>)}
                </tr>
            </thead>
            <tbody>
                {threadLocals.map((locals, threadId) =>
                    <tr key={threadId}>
                        <th style={{ border: "1px solid black", padding: "3px" }}>{threadId}</th>
                        {allLocals.map(name => <td style={{ border: "1px solid black", padding: "3px" }} key={`${threadId}-${name}`}>{locals[name] ? JSON.stringify(locals[name]) : ""}</td>)}
                    </tr>
                )}
            </tbody>
        </table>
    </>;
}