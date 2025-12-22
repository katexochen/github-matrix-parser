# GitHub Matrix Parser

A simple tool to visualize GitHub Actions matrix combinations and debug complex matrix configurations.

You can try it online: [https://katexochen.github.io/github-matrix-parser/](https://katexochen.github.io/github-matrix-parser/)

## Features

- **visualize**: Paste your matrix YAML and see exactly what jobs GitHub will generate.
- **includes/excludes**: Correctly handles `include` and `exclude` logic, including complex matching rules.
- **underspecified detection**: Identifies jobs that are missing keys present in other jobs (optional check).
- **multi-job support**: Can parse full workflow files and extract matrices from multiple jobs.
- **CLI**: Includes a command-line interface for use in scripts or CI.

## CLI Usage

You can use the tool via the command line:

```bash
# Run on a file
npx github-matrix-parser matrix.yml

# Output as JSON
npx github-matrix-parser --output=json workflow.yml

# Validate (fail if invalid or underspecified)
npx github-matrix-parser --check matrix.yml

# Validate but allow underspecified jobs
npx github-matrix-parser --check --allow-underspecified matrix.yml
```

## Development

This project uses Nix flakes to provide the development environment.

1. Enter the development shell:
   ```bash
   nix develop
   ```

2. Install dependencies (first time only):
   ```bash
   pnpm install
   ```

3. Start the dev server:
   ```bash
   pnpm dev
   ```

4. Run tests:
   ```bash
   pnpm test
   ```

## Build

To build for production:

```bash
pnpm build
```

The output will be in the `dist` directory.
