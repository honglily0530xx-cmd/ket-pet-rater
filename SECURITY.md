# Security and Privacy

This project may process student writing, names, feedback records, and uploaded PDF reports. Treat those files as private educational records.

## Before Publishing

- Check `git status --short` before every push.
- Do not commit `data/*.sqlite`, `data/*.sqlite-wal`, or `data/*.sqlite-shm`.
- Do not commit real student reports or writing samples.
- Replace real names with `Student A`, `Student B`, or class-neutral labels.
- Remove local paths such as `/Users/...` from public documentation.
- Keep API keys in environment variables, never in source files.

## Local Data

The app stores runtime data in SQLite under `data/`. These files are ignored by Git and should stay on your own machine.

## API Keys

Supported model keys are read from environment variables:

- `OPENAI_API_KEY`
- `ANTHROPIC_AUTH_TOKEN`
- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_MODEL`

Do not paste real keys into `public/config.js`, README files, screenshots, or issue comments.

