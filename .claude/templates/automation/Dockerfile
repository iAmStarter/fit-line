# iStartSoftFlow — headless runner image (Docker lane).
# Installed by `npx create-issflow --docker` as Dockerfile.issflow.
# Built + run by scripts/feature-docker.js — you rarely use this file directly.
#
# The container IS the sandbox: an ephemeral, unprivileged workspace where
# `claude --dangerously-skip-permissions` is acceptable because the blast radius
# is the mounted repo only. Never mount the Docker socket or your $HOME into it.
#
# The image is tool-only; YOUR project's runtime deps are not baked in. If the
# feature lane must run your test suite and it needs more than Node (Python, Go,
# a DB client, …), extend this image: `FROM issflow-runner` + your toolchain.

FROM node:20-bookworm-slim

# git — branches/commits are the lane's deliverable. ca-certificates — API TLS.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g @anthropic-ai/claude-code

# sanity: the kit's lifecycle hooks are `node .claude/hooks/*.js` — a runner
# image WITHOUT node runs claude fine but every hook silently dies (no
# session-start context, no feature gate). Fail the build, not the run.
RUN node --version && claude --version

# unprivileged runner; /work is the mounted repo.
RUN useradd --create-home --shell /bin/sh runner
USER runner
WORKDIR /work

# headless marker — /feature degrades every hard-stop to a BLOCKED report + clean exit.
ENV ISSFLOW_HEADLESS=1

# identity for the commits the lane makes (override via docker run -e).
ENV GIT_AUTHOR_NAME="issflow-runner" \
    GIT_AUTHOR_EMAIL="issflow-runner@local" \
    GIT_COMMITTER_NAME="issflow-runner" \
    GIT_COMMITTER_EMAIL="issflow-runner@local"

ENTRYPOINT ["claude"]
