// ============================================================
// mindfully.gg — reply-pairing checks
//
//   npx tsx scripts/check-pairing.ts
//
// No network, no cognition, no env. Exercises `selectReplyIndex`, which decides
// which history row is the answer to a given sent message.
//
// This exists because the pairing logic has been silently wrong twice, and both
// times it produced a plausible answer written about the wrong person — which
// reads as a Skill defect, not a client bug. An eleven-case eval lost four of
// its results to it before anyone noticed the duplicated prose.
// ============================================================

import { selectReplyIndex, type HistoryRow } from "@/lib/minds-client";

const human = (text: string, fingerprint?: string): HistoryRow => ({
    messageText: text,
    senderType: 1,
    fingerprint,
});
const mind = (text: string, fingerprint?: string): HistoryRow => ({
    messageText: text,
    senderType: 2,
    fingerprint,
});

let failed = 0;

function check(name: string, actual: number, expected: number): void {
    const ok = actual === expected;
    if (!ok) failed++;
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : ` — got ${actual}, expected ${expected}`}`);
}

console.log("\nreply pairing (no network)\n");

// A settled two-turn conversation, in both possible sort directions.
{
    const oldestFirst = [
        human("prompt-1", "f1"), mind("reply-1", "f2"),
        human("prompt-2", "f3"), mind("reply-2", "f4"),
    ];
    check(
        "oldest-first: reply follows its prompt",
        selectReplyIndex(oldestFirst, "prompt-2", "f2"),
        3
    );

    const newestFirst = [...oldestFirst].reverse();
    // After reversing, "f2" (reply-1) sits at index 2 and prompt-2 at index 1.
    check(
        "newest-first: same answer, opposite direction",
        selectReplyIndex(newestFirst, "prompt-2", "f2"),
        0
    );
}

// THE REGRESSION. Our reply has not landed yet, so the only Mind message near
// our prompt is the PREVIOUS answer. Taking it is the bug this guards against.
{
    const pending = [
        human("prompt-1", "f1"), mind("reply-1", "f2"), human("prompt-2", "f3"),
    ];
    check(
        "oldest-first: no reply yet → decline, never take the previous one",
        selectReplyIndex(pending, "prompt-2", "f2"),
        -1
    );

    const pendingNewest = [...pending].reverse();
    check(
        "newest-first: no reply yet → decline",
        selectReplyIndex(pendingNewest, "prompt-2", "f2"),
        -1
    );
}

// No prior fingerprint: a fresh conversation, which every newly provisioned
// Vigil starts with.
{
    check(
        "fresh conversation: one prompt, one reply → pair them",
        selectReplyIndex([human("prompt-1"), mind("reply-1")], "prompt-1", undefined),
        1
    );
    check(
        "fresh conversation: reply not yet arrived → decline",
        selectReplyIndex([human("prompt-1")], "prompt-1", undefined),
        -1
    );
    check(
        "direction unknowable, Mind messages on both sides → decline",
        selectReplyIndex(
            [mind("earlier"), human("prompt-1"), mind("later")],
            "prompt-1",
            undefined
        ),
        -1
    );
}

// Edge cases that should not throw or guess.
{
    check(
        "our message absent from the window → decline",
        selectReplyIndex([human("other"), mind("reply")], "prompt-1", "f1"),
        -1
    );
    check(
        "stale prior fingerprint not in the window → falls back to the single-neighbour rule",
        selectReplyIndex([human("prompt-1"), mind("reply-1")], "prompt-1", "gone"),
        1
    );
    check(
        "empty history → decline",
        selectReplyIndex([], "prompt-1", "f1"),
        -1
    );
    check(
        "duplicate prompts: the most recent send wins",
        selectReplyIndex(
            [
                human("same", "f1"), mind("old-reply", "f2"),
                human("same", "f3"), mind("new-reply", "f4"),
            ],
            "same",
            "f2"
        ),
        3
    );
    check(
        "an empty Mind message is not a reply",
        selectReplyIndex(
            [human("prompt-1", "f1"), { messageText: "", senderType: 2 }],
            "prompt-1",
            undefined
        ),
        -1
    );
}

console.log(
    failed === 0
        ? "\nall pairing checks passed\n"
        : `\n${failed} pairing check(s) FAILED\n`
);
process.exit(failed === 0 ? 0 : 1);
