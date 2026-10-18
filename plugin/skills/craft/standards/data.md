# Schema and data changes

- Schema migrations go in a PR of their own, merged before the code that uses them. That PR holds only the migrations, plus the schema dump they regenerate if the project keeps one.
- A migration never fills in or changes data. A backfill or a data fix is a script in a PR comment, run by hand after the deploy, and running it again is safe, for example because it also matches `col IS NULL`.
- A migration on an existing table states in its PR description how it locks that table at production size and for how long, even when it is one line.
- Before a unique constraint is added, the data in every environment it will run in, shared staging included, is checked for duplicates. Until that is done, the PR description lists it under Before merge.
- A script that changes data:
  - has a read-only preview mode and a write mode;
  - uses one transaction per unit;
  - logs a failed unit and goes on with the next;
  - prints a summary at the end;
  - can run again.
- A script that moves data checks the destination item by item before it deletes the source.
