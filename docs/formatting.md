# Code formatting

- `pnpm format` formats JavaScript, TypeScript, JSX, TSX, JSON, CSS, HTML, XML, YAML and Markdown with the pinned Prettier installation. Use `pnpm format:check` to check formatting.
- Python uses Black 26.10.1 with a line length of 100: `uvx --from black==26.10.1 black --line-length 100 apps/python-script/src apps/python-script/tests`.
- Kotlin and Gradle Kotlin scripts use ktfmt 0.64 with `--kotlinlang-style`. Pass only source `.kt` and `.kts` files, excluding generated build directories.

Generated output, dependencies, temporary files and runtime error reports are excluded. Keep temporary formatter downloads and logs in the repository-root `.tmp/` directory.
