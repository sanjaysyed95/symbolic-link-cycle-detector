/**
 * Tracks symbolic-link (symlink) target paths encountered during a filesystem
 * traversal. Its sole job is to report whether entering a given path would close
 * a cycle, so callers can avoid infinite recursion in `fs.realpath`-style walks.
 *
 * Design decisions:
 *
 * - Identity is based on resolved string paths, NOT raw `lstat`/`readlink` results.
 *   The caller is responsible for resolving links to absolute canonical strings
 *   (e.g. via `fs.realpath`). The detector only compares strings. This keeps the
 *   module pure and trivially testable, with no filesystem dependency.
 *
 * - Detection uses a stack (the current chain) plus a visited set (all paths
 *   ever seen). The stack catches a true cycle back to an ancestor; the visited
 *   set catches a cross-edge into a previously explored subtree, which on a
 *   real filesystem would not be a cycle but which a naive recursive walker
 *   would still re-walk. We report both as "already visited" so callers can skip
 *   redundant work, and report true cycles separately.
 *
 * - The only failure mode is a non-string argument. We throw a TypeError rather
 *   than returning a boolean, because passing the wrong type is a programmer
 *   error, not a runtime condition the caller should branch on.
 */
export class CycleDetector {
    /**
     * @param {object} [opts]
     * @param {Iterable<string>} [opts.initialVisited] Pre-seed the visited set
     *   (rarely needed; useful when resuming a partial traversal).
     */
    constructor(opts = {}) {
        const initial = opts.initialVisited;
        if (initial !== undefined && initial !== null && typeof initial[Symbol.iterator] !== 'function') {
            throw new TypeError('opts.initialVisited must be iterable');
        }

        /** @type {Set<string>} paths currently on the active descent chain. */
        this._stack = new Set();
        /** @type {string[]} ordered stack for enter/exit symmetry. */
        this._order = [];
        /** @type {Set<string>} every path ever entered. */
        this._visited = new Set();

        if (initial) {
            for (const p of initial) {
                if (typeof p !== 'string') {
                    throw new TypeError('initialVisited must contain only strings');
                }
                this._visited.add(p);
            }
        }
    }

    /**
     * Attempt to enter `resolvedPath`. Call this after resolving symlinks to an
     * absolute canonical string, before recursing into the entry.
     *
     * @param {string} resolvedPath
     * @returns {{cycle: boolean, revisited: boolean, entered: boolean}}
     *   - `cycle`: true if `resolvedPath` is an ancestor in the current chain.
     *   - `revisited`: true if `resolvedPath` was entered in any previous chain.
     *   - `entered`: true if this call actually pushed the path (i.e. it was new
     *     to the current chain). False on cycle or revisited.
     *
     * On `cycle` or `revisited`, the detector state is NOT modified; the caller
     * must not call `exit()` for this path.
     */
    enter(resolvedPath) {
        if (typeof resolvedPath !== 'string') {
            throw new TypeError('resolvedPath must be a string');
        }
        if (resolvedPath.length === 0) {
            // An empty path is never a meaningful filesystem target; treating it
            // as a cycle would be noise. Reject up front so callers surface the
            // bug in their own resolution logic.
            throw new TypeError('resolvedPath must be non-empty');
        }

        const inChain = this._stack.has(resolvedPath);
        if (inChain) {
            return { cycle: true, revisited: true, entered: false };
        }

        const seenBefore = this._visited.has(resolvedPath);
        if (seenBefore) {
            // Cross-edge into a previously explored subtree. Not a true cycle,
            // but re-walking would duplicate work. Report and leave state alone.
            return { cycle: false, revisited: true, entered: false };
        }

        this._stack.add(resolvedPath);
        this._order.push(resolvedPath);
        this._visited.add(resolvedPath);
        return { cycle: false, revisited: false, entered: true };
    }

    /**
     * Leave the most recently entered path. Only call this for an `enter()`
     * whose result had `entered: true`.
     *
     * @returns {string} the path that was exited.
     */
    exit() {
        if (this._order.length === 0) {
            throw new Error('exit() called with empty stack');
        }
        const path = this._order.pop();
        this._stack.delete(path);
        return path;
    }

    /** Current depth of the descent chain. */
    get depth() {
        return this._order.length;
    }

    /** Snapshot of the active chain, root-first. */
    chain() {
        return this._order.slice();
    }

    /** True if `resolvedPath` has ever been entered in any chain. */
    hasVisited(resolvedPath) {
        if (typeof resolvedPath !== 'string') {
            throw new TypeError('resolvedPath must be a string');
        }
        return this._visited.has(resolvedPath);
    }
}
