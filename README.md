# symbolic-link-cycle-detector

A tiny, dependency-free helper that tracks resolved symlink paths during a filesystem traversal and tells you when entering one would close a cycle, before you recurse into infinity.

## Usage

```js
import { CycleDetector } from 'symbolic-link-cycle-detector';

const det = new CycleDetector();

// Call enter() with the CANONICAL resolved path of each filesystem entry,
// right after resolving its symlinks and before recursing into it.
const r = det.enter('/srv/site/current');
if (r.cycle) {
  // /srv/site/current is an ancestor on the active chain — a real symlink
  // loop. Do not recurse; optionally report the chain via det.chain().
} else if (r.revisited) {
  // Cross-edge into a subtree you've already explored. Not a cycle, but
  // skipping it avoids redundant work.
} else {
  // Fresh entry. Recurse, then call det.exit() when you leave it.
}

det.exit(); // only when entered: true
```

## Why this exists

Recursive directory walkers that follow symlinks can loop forever on `a -> b -> a`. The standard fix is to remember what you're currently descending into and refuse to re-enter anything already on the stack. Doing that ad hoc inside every walker is error-prone, so this module factors it out.

The deliberate trade-off is that this library only compares **strings**. It does not call `fs.realpath`, `lstat`, or `readlink`, and it does not normalize `..` segments. The caller resolves links to canonical absolute paths and hands those strings in. This keeps the module pure, synchronous, testable without a filesystem, and free of Node's `fs` surface, at the cost of pushing one line of resolution work onto the caller.

## The awkward edge

There are two distinct "I've seen this before" conditions, and the API reports them separately because callers usually want to treat them differently:

- `cycle: true` — the path is an **ancestor on the active descent chain** (a true loop). You must not recurse.
- `revisited: true` with `cycle: false` — the path was entered in some earlier chain that has since been fully exited. On a real filesystem this is usually a cross-edge into an already-explored subtree, not a loop, but re-walking it duplicates work. Many walkers skip it; some don't.

In both cases `entered` is `false` and the detector's state is **not** modified, so you must not call `exit()` for that path. The state is only advanced when `entered` is `true`, and only then should `exit()` be called on the way back up.

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

