# Contributing to OpenVibe

Thank you for your interest in OpenVibe! Bug reports, ideas, documentation and code are all welcome. You can write in English or in French.

By taking part, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

- **Found a bug?** Search the [issues](https://github.com/Mideky-hub/openvibe/issues) first, then open a bug report with the steps to reproduce, what you expected and what happened. Include your Windows version and the agent CLI and version involved.
- **Have an idea?** Check [BACKLOG.md](BACKLOG.md): it may already be planned. Then open a feature request that explains the problem it solves.
- **Found a security problem?** Do not open an issue. Follow [SECURITY.md](SECURITY.md).
- **Want to write code?** For anything bigger than a small fix, please open an issue first, so we can agree on the approach before you spend time on it.

## Development setup

You need Windows 10/11 and:

- [Tauri 2's Windows prerequisites](https://v2.tauri.app/start/prerequisites/): the Microsoft C++ Build Tools and WebView2;
- [Rust](https://rustup.rs/) 1.85 or newer, with `clippy` and `rustfmt`;
- [Node.js](https://nodejs.org/) 22 LTS and [pnpm](https://pnpm.io/) 10;
- [Git](https://git-scm.com/), whose Git Bash provides the `bash` used by the usage meter;
- at least one agent CLI on your `PATH`, for example Claude Code, to try the agent features.

```powershell
git clone https://github.com/Mideky-hub/openvibe.git
cd openvibe
pnpm install
pnpm tauri dev --config '{"identifier":"dev.openvibe.probe"}'
```

The `--config` flag gives the development build its own data folder (`%APPDATA%\dev.openvibe.probe\`), so your experiments never touch the projects you use OpenVibe for. Use it whenever you try a change in the app. It also lets the development build run next to an installed OpenVibe: only one instance runs per identifier, and a second launch just brings the first one's window back.

### Testing your agent setup safely

Keep in mind that OpenVibe drives real agents with your real accounts:

- **Agents spend real usage.** Each prompt you send consumes your subscription or API credits. Keep test prompts short, and prefer a small model.
- **Some commands change your agent's own settings.** In Claude Code, for example, `/effort` and `/model` save a new default for future sessions, and `/remote-control` registers the session in your claude.ai account. Back up `~/.claude/settings.json` before you test them, and put things back afterwards.
- **Use throwaway repositories.** Missions create branches and worktrees. Never test them in a repository you care about.

## Checks

Run all of these before you open a pull request. They are what the maintainer runs on every change.

```powershell
pnpm exec tsc --noEmit                                                   # types
pnpm test                                                                # front-end tests (Vitest)
cargo test --manifest-path src-tauri/Cargo.toml                          # Rust tests
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo fmt --manifest-path src-tauri/Cargo.toml --check
```

The front-end tests live next to the code (`*.test.ts`, `*.test.tsx`); those that need a DOM start with `// @vitest-environment happy-dom`. The Rust tests are `#[cfg(test)]` modules in the same files, and the git-based ones create temporary repositories.

## How we work

- **Tests first.** Every feature and every fix comes with a test, written before the code and seen failing first. A bug fix includes the test that reproduces the bug.
- **Check it in the app too.** For anything visible, try the change in the development build (with the separate profile above) and, when it helps, attach a screenshot or a short GIF to the pull request.
- **Specs for big features.** Larger features start with a written design in [`docs/superpowers/specs/`](docs/superpowers/specs/), then an implementation plan in [`docs/superpowers/plans/`](docs/superpowers/plans/). These documents are in French; you can discuss them in English.
  - Read the relevant spec before you change a feature: comments in the code often cite its sections, for example `spec habillage §10.3`.
- **User-visible changes go to the changelog.** Add a line under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md), in words a user understands. Releases are cut as [docs/RELEASING.md](docs/RELEASING.md) describes.
- **Findings go to the backlog.** Issues you notice but don't fix belong in [BACKLOG.md](BACKLOG.md), not in a comment in the code.

### Code style

- **Language.** The interface speaks English and French. A new label, message or tooltip goes into both languages of its domain's `messages.ts` (`defineMessages(fr, en)`: a missing translation does not compile). Tests run in French; add an English test for what you add. Code, comments, test names and commit messages are in English.
- **Comments** explain why rather than what, and match the density of the code around them.
- **TypeScript** is strict, with no unused locals or parameters; there is no ESLint or Prettier, so follow the formatting of the surrounding code. Import from `src/` with the `@/` alias.
- **Rust** follows `rustfmt`, and clippy must pass with `-D warnings`.
- **Dependencies** are added at an exact version, and only when they earn their place.
- **Line endings.** Files are stored with LF in the repository, even if Git checks them out with CRLF on Windows.
- **Small files** with one clear job are easier to review than large ones.

### Commits and branches

- Branches: `feat/<name>` for a feature, `fix/<name>` for a fix, `docs/<name>` for documentation.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/), in English: `feat(review): send all remarks in one message`, `fix(shell): keep the usage meter clear of the search field`, `docs(readme): …`.
- One logical change per commit; explain the why in the body when it isn't obvious.

## Pull requests

1. Fork the repository and create your branch from `main`.
2. Make your change, with its tests.
3. Run the [checks](#checks).
4. Open the pull request and fill in its template: what changed, why, and how you tested it.

The maintainer reviews pull requests when time allows. Small, focused pull requests get merged faster.

## License

OpenVibe is released under the [MIT License](LICENSE). By contributing, you agree that your contributions are licensed under the same terms.
