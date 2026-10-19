# Git and PR workflow

How changes are committed, integrated, and published.

- One slice is one set of commits; two slices never share a commit.
- Independent changes merge separately: never bundle unrelated changes into one PR to save a deploy. Combine them only when they must merge together.
- Never put a self-made number (`S-001`, `slice 3`) in a ticket title, a commit, or the code: the ticket system already holds where a change belongs and in what order, and a second copy of that state drifts. Such numbers belong only in a single working document that can be regenerated whole.
- Until a branch has a PR or reaches a shared branch such as staging, you may rebase it and push with `--force-with-lease`.
- After that, never rewrite it: no rebase, amend, squash, or force push. Bring other branches in with `git merge`, and make every change, including one from review, a new commit, so each review round can be read on its own. When a merge cannot resolve something, ask the user.
- In a working tree that other agents or tools use at the same time, stage explicit paths, never `git add -A`: the tree may hold files someone else left there.
