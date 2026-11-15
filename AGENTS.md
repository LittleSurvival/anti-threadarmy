# Repository Guidelines

- Use UTF-8 explicitly when reading or writing text and when configuring PowerShell output. Paths and content may contain non-English characters.
- Do not use Computer Use unless the user explicitly requests it.
- Keep all tests, fixtures, test helpers, and test-only scripts in the owning module's `tests/` directory.
- For mobile modules, use the architecture's native test source sets, such as `src/commonTest/` and `src/androidTest/`, instead of a generic `tests/` directory.
- Store temporary working files, scratch scripts, logs, screenshots, and debug artifacts in the repository-root `.tmp/` directory. Delete temporary content when it is unlikely to be useful again.
- Keep build and packaged deliverables inside their owning module. Do not place them in a repository-root `output/` directory or outside the module.
