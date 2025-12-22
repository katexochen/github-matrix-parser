# GitHub Matrix Parser

A simple tool to visualize GitHub Actions matrix combinations.

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

## Build

To build for production:

```bash
pnpm build
```

The output will be in the `dist` directory.
