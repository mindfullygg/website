// ============================================================
// mindfully.gg — Skill documentation checker
//
// Free, offline, and exists because prose is the only artefact on this project
// that nothing verifies. `fixtures.json` fails when it is wrong. A prompt is
// generated from the builder production calls. A README is checked by nobody,
// which is why the public file has twice been the stale one while the withheld
// files were right — see the culture role's learnings §4.
//
// Five checks, none of them clever:
//
//   1. No `file.ts:123` citations. A line number is an assertion nothing
//      re-derives; every one of them in this repo was wrong within a week of
//      being written, and a confidently wrong pointer costs more than none.
//      Name the symbol instead — that is greppable and it moves with the code.
//   2. Relative links resolve. Including links to files that are gitignored,
//      which resolve locally and 404 for the reader the file is written for.
//   3. Case ids mentioned in prose exist in that skill's fixtures.json.
//   4. Case ids are unique within a suite.
//   5. Every substantive SKILL.md body line appears in the build email. That
//      check was being run by hand, and it exists because a regex once ate two
//      characters off every line of a build email and spot-checking the top of
//      the file did not catch it. The email is what builds the Skill, and a
//      published body cannot be edited afterwards.
//
//   npx tsx scripts/check-docs.ts
// ============================================================

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const SKILLS_DIR = "skills";
const DOCS = ["README.md", "instructions.md", "learnings.md", "critical.md"];

interface Problem {
    file: string;
    detail: string;
}

const problems: Problem[] = [];
const note = (file: string, detail: string) => problems.push({ file, detail });

/** Markdown emphasis and headings differ between the body and the plain-text
 *  email; only the words have to match. */
function normalise(text: string): string {
    return text
        .replace(/\*\*/g, "")
        .replace(/[`*]/g, "")
        .replace(/^#+\s*/gm, "")
        .replace(/\s+/g, " ");
}

function checkSkill(dir: string): void {
    const skill = join(SKILLS_DIR, dir);
    if (!statSync(skill).isDirectory()) return;

    // --- fixtures: unique ids, and the set prose is allowed to mention ---
    const fixturesPath = join(skill, "fixtures.json");
    const caseIds = new Set<string>();
    if (existsSync(fixturesPath)) {
        const fixtures = JSON.parse(readFileSync(fixturesPath, "utf8"));
        for (const c of fixtures.cases ?? []) {
            if (caseIds.has(c.id)) {
                note(fixturesPath, `duplicate case id "${c.id}"`);
            }
            caseIds.add(c.id);
        }
    }

    for (const doc of DOCS) {
        const path = join(skill, doc);
        if (!existsSync(path)) continue;
        const text = readFileSync(path, "utf8");

        // 1. line-number citations
        for (const m of text.matchAll(/`?([\w./-]+\.ts):(\d+(?:[–-]\d+)?)`?/g)) {
            note(path, `line-number citation "${m[1]}:${m[2]}" — name the symbol instead`);
        }

        // 2. relative links resolve
        for (const m of text.matchAll(/\]\((?!https?:)([^)#]+)(?:#[^)]*)?\)/g)) {
            const target = resolve(dirname(path), m[1]);
            if (!existsSync(target)) note(path, `dead link "${m[1]}"`);
        }

        // 3. case ids mentioned in prose exist. Only checks backticked
        //    hyphenated lowercase words, which is what a case id looks like and
        //    what a stale one looks like too.
        //
        //    Operational docs only. `learnings.md` and `critical.md` are a
        //    record of what happened, and a case that was renamed or deleted is
        //    exactly what some of those entries are *about* — the trust
        //    keeper's §4 is the story of a fixture that no longer exists.
        //    Correcting a name there would damage the record. A stale id in
        //    `instructions.md` is a different thing: it is a `--case` argument
        //    that returns nothing.
        const operational = doc === "instructions.md" || doc === "README.md";
        if (caseIds.size > 0 && operational) {
            for (const m of text.matchAll(/`([a-z][a-z0-9]*(?:-[a-z0-9]+){2,})`/g)) {
                const token = m[1];
                if (caseIds.has(token)) continue;
                // Ignore things that are plainly not case ids: filenames, paths,
                // and Mind ids, which are hyphenated lowercase hex and match
                // the same shape.
                if (/\.(ts|json|md)$/.test(token) || token.includes("/")) continue;
                if (/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(token)) continue;
                if ([...caseIds].some((id) => id.startsWith(token) || token.startsWith(id))) continue;
                note(path, `"${token}" looks like a case id and is not in fixtures.json`);
            }
        }
    }

    // --- 5. the build email carries the whole body ---
    const bodyPath = join(skill, "SKILL.md");
    // Every email, not just the build request. A body line has to have been
    // SENT — but the build email is a record of what was sent once, and
    // rewriting it to match a later edit would make it a lie about history.
    // A revision email carries the changed section instead, so the invariant is
    // "no line in the body that no email ever carried".
    const emails = readdirSync(skill).filter(
        (f) => f.startsWith("email-") && f.endsWith(".txt")
    );
    if (existsSync(bodyPath) && emails.length > 0) {
        const raw = readFileSync(bodyPath, "utf8");
        const body = raw.includes("## Body") ? raw.split("## Body")[1] : raw;
        const emailPath = emails.map((f) => join(skill, f)).join(", ");
        const email = normalise(
            emails.map((f) => readFileSync(join(skill, f), "utf8")).join("\n")
        );
        const lines = body
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.length > 0 && !l.startsWith("---"));

        const missing = lines.filter((l) => !email.includes(normalise(l).trim()));
        for (const l of missing.slice(0, 5)) {
            note(emailPath, `build email is missing a body line: "${l.slice(0, 60)}…"`);
        }
        if (missing.length > 5) {
            note(emailPath, `…and ${missing.length - 5} more body lines missing`);
        }
        if (missing.length === 0) {
            console.log(`  ok    ${dir}: build email carries all ${lines.length} body lines`);
        }
    }
}

console.log("\nchecking skill docs (local, no tokens)\n");

for (const dir of readdirSync(SKILLS_DIR)) {
    if (dir.startsWith(".") || !statSync(join(SKILLS_DIR, dir)).isDirectory()) continue;
    checkSkill(dir);
}

if (problems.length === 0) {
    console.log("\nall clean\n");
    process.exit(0);
}

console.log();
const byFile = new Map<string, string[]>();
for (const p of problems) {
    byFile.set(p.file, [...(byFile.get(p.file) ?? []), p.detail]);
}
for (const [file, details] of byFile) {
    console.log(`  ${file}`);
    for (const d of details) console.log(`    - ${d}`);
}
console.log(`\n${problems.length} problem(s)\n`);
process.exit(1);
