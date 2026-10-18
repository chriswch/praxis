# Tests

- Test names describe behavior, not implementation; the example names are the spec. A test that fails when only the implementation changes is wrong.
- Test at the feature's boundary: the handler, the worker, or the public interface. Internal collaborators get no tests of their own, and a behavior an integration test already covers gets no separate unit test. One behavior has one example per test file.
- Use only scenarios that do happen: seen in the logs, reproduced, or stated in the vendor's documentation. Where a real case exists, its requests and responses are copied from it, and one endpoint's real error is never reused for another.
- Assert only settled behavior. When an outcome depends on external behavior nobody has confirmed, what the code does today is not the expected behavior: leave it out of the tests and list it under Known gaps in the PR description. Removing a defense does not earn a test of what the code now does.
- A test that asserts something did not happen proves that its capture works: run it once with the real configuration and an event injected on the path that must stay silent, and see it fail. Keep a canary test in which the same capture does see an event.
- Stub a third-party API at the HTTP layer, so the project's own client for it runs in the test. The cache is real, like the database.
- Test data states its condition through the project's test-data builders, such as factories with named variants. Literal values live in the builder or the stub helper; examples refer to the attributes of the objects they build.
- A bug fix starts with a test that fails before the fix and passes after it.
- When a test fails, decide from the requirements or the git history which side is out of date: the test or the code. Change an assertion only when you can say in one sentence why the new expectation is right, not only why it passes.
