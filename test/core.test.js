import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CycleDetector } from '../src/index.js';

// Helpers: build canonical absolute-style paths so the string identity used by
// the detector is realistic without touching a real filesystem.
const p = (parts) => parts.join('/');

const ROOT = '/a';
const SUB = '/a/b';
const LEAF = '/a/b/c';
const SIBLING = '/a/d';

test('first enter of a fresh path is entered, not a cycle, not revisited', () => {
    const d = new CycleDetector();
    const r = d.enter(ROOT);
    assert.deepEqual(r, { cycle: false, revisited: false, entered: true });
    assert.equal(d.depth, 1);
    assert.deepEqual(d.chain(), [ROOT]);
});

test('entering a descendant of the current path proceeds normally', () => {
    const d = new CycleDetector();
    assert.equal(d.enter(ROOT).entered, true);
    assert.equal(d.enter(SUB).entered, true);
    assert.equal(d.enter(LEAF).entered, true);
    assert.equal(d.depth, 3);
    assert.deepEqual(d.chain(), [ROOT, SUB, LEAF]);
});

test('entering an ancestor already on the chain reports a cycle', () => {
    const d = new CycleDetector();
    d.enter(ROOT);
    d.enter(SUB);
    d.enter(LEAF);

    // A symlink at LEAF points back to ROOT — classic cycle.
    const r = d.enter(ROOT);
    assert.deepEqual(r, { cycle: true, revisited: true, entered: false });

    // State is untouched: the caller must NOT call exit() for the refused enter.
    assert.equal(d.depth, 3);
    assert.deepEqual(d.chain(), [ROOT, SUB, LEAF]);
});

test('entering an intermediate ancestor also reports a cycle', () => {
    const d = new CycleDetector();
    d.enter(ROOT);
    d.enter(SUB);
    d.enter(LEAF);

    // Symlink at LEAF points to SUB (not the root). Still a cycle.
    const r = d.enter(SUB);
    assert.deepEqual(r, { cycle: true, revisited: true, entered: false });
});

test('exit pops the most recent entry and decrements depth', () => {
    const d = new CycleDetector();
    d.enter(ROOT);
    d.enter(SUB);
    const popped = d.exit();
    assert.equal(popped, SUB);
    assert.equal(d.depth, 1);
    assert.deepEqual(d.chain(), [ROOT]);
});

test('a path visited in a previous, fully exited chain is reported as revisited, not a cycle', () => {
    const d = new CycleDetector();
    d.enter(ROOT);
    d.enter(SUB);
    d.exit(); // leave SUB
    d.exit(); // leave ROOT; chain is now empty

    assert.equal(d.depth, 0);
    assert.deepEqual(d.chain(), []);

    // Re-entering ROOT is not a cycle (it's not on the active chain), but it IS
    // a revisit of a previously explored subtree.
    const r = d.enter(ROOT);
    assert.deepEqual(r, { cycle: false, revisited: true, entered: false });
    assert.equal(d.depth, 0);
});

test('a sibling path entered after exiting a sibling is fresh, not revisited', () => {
    const d = new CycleDetector();
    d.enter(ROOT);
    d.enter(SUB);
    d.exit(); // leave SUB

    // SIBLING was never entered before. It's a fresh subtree under ROOT.
    const r = d.enter(SIBLING);
    assert.deepEqual(r, { cycle: false, revisited: false, entered: true });
    assert.equal(d.depth, 2);
});

test('hasVisited reflects all paths ever entered, even after exit', () => {
    const d = new CycleDetector();
    d.enter(ROOT);
    d.enter(SUB);
    d.exit();
    d.exit();

    assert.equal(d.hasVisited(ROOT), true);
    assert.equal(d.hasVisited(SUB), true);
    assert.equal(d.hasVisited(LEAF), false);
    assert.equal(d.hasVisited(SIBLING), false);
});

test('a non-string argument to enter throws TypeError', () => {
    const d = new CycleDetector();
    assert.throws(() => d.enter(42), TypeError);
    assert.throws(() => d.enter(null), TypeError);
    assert.throws(() => d.enter(undefined), TypeError);
    assert.throws(() => d.enter({}), TypeError);
});

test('an empty string argument to enter throws TypeError', () => {
    const d = new CycleDetector();
    assert.throws(() => d.enter(''), TypeError);
});

test('exit with an empty stack throws', () => {
    const d = new CycleDetector();
    assert.throws(() => d.exit());
});

test('initialVisited pre-seeds the visited set', () => {
    const d = new CycleDetector({ initialVisited: [ROOT, SUB] });

    // ROOT is pre-seeded: entering it is a revisit, not a cycle.
    const r = d.enter(ROOT);
    assert.deepEqual(r, { cycle: false, revisited: true, entered: false });
    assert.equal(d.hasVisited(ROOT), true);
    assert.equal(d.hasVisited(LEAF), false);
});

test('initialVisited with a non-iterable throws TypeError', () => {
    assert.throws(() => new CycleDetector({ initialVisited: 42 }), TypeError);
    assert.throws(() => new CycleDetector({ initialVisited: {} }), TypeError);
});

test('initialVisited with non-string element throws TypeError', () => {
    assert.throws(() => new CycleDetector({ initialVisited: [ROOT, 7] }), TypeError);
});
