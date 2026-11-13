# 0005. BRClient built from pinned upstream source

Status: Accepted. Supersedes [0004](0004-brclient-from-a-pinned-image-layer.md).

## Context

The server serves `./brclient` at `/brclient/`. The images got that directory from a release step outside this repository, and the `lambda-web` package took it from a layer of the public 0.0.44 image (ADR 0004). Both serve BRClient v1.2.4.

The next release needs a BRClient feature, the image download button, that exists only in an open pull request of the upstream BRClient repository, `aws-samples/sample-client-for-amazon-bedrock`. No image layer and no BRClient release contains it. Once the pull request is merged, upstream `main` has it.

`WebFnPackage` rebuilds the `lambda-web` package from `SourceRef`, also on a rollback. So whatever the package build reads has to be fixed by the commit at `SourceRef`.

## Decision

- **Decide once, at release time.** `scripts/resolve-brclient.mjs` reads upstream `main` and, when a pull request is named, its state from the GitHub API, and writes `scripts/brclient.source`: the upstream repository, the `main` commit as the base, and, for an open pull request, its number and head commit. A merged pull request adds nothing, because `main` already contains it. The script reads the pull request before `main`, so a merge that lands between the two requests is in the `main` it pins, and for a merged pull request it checks with the compare API that `main` contains the merge commit. A pull request that was closed without merging, or that targets another branch, stops the script, and so does a `main` that does not contain the merge yet. Without `--pr`, the script looks up the pull request recorded in the current file again, so the release step is the same command every time. The file is committed with the release.
- **Build from the pin only.** `scripts/fetch-brclient.sh <dest>` reads `scripts/brclient.source` and never asks GitHub about the pull request. It fetches the base and the head by commit id into a scratch repository, merges the head without committing, and stops on a conflict. It then builds with node 22 and the yarn 1 version named by the source's `packageManager` field (`yarn install --frozen-lockfile`, `yarn export`) in an environment that holds only `PATH`, `HOME`, `TMPDIR` and the proxy variables. It copies `out/` to `<dest>` and writes `<dest>/.source` with the four pinned values and the git tree id of the merged source.
- It fetches the pinned head by its commit id, not the pull request's head ref. A later push to the pull request moves the head ref, and a comparison with the pin would then fail every rebuild of a released `SourceRef`. A fetch by id gives that exact commit or fails, because git checks object ids.
- **One script for every artifact.** `scripts/build-web-function-zip.sh` calls it for the package's `brclient/`. `Dockerfile` and `lambda.Dockerfile` call it in a first stage that runs on the build platform (`FROM --platform=$BUILDPLATFORM`) and copy the result to `/app/brclient`. `.dockerignore` excludes `dist/brclient`, so a BRClient that an older release step puts in `dist/` cannot mix with the built one.
- When `node` is not version 22 and nvm is installed, the script takes node 22 from nvm. The `lambda-web` build runs with node 24 and nvm, so the template does not change.
- `scripts/brclient.pin` is removed.

## Consequences

- The BRClient in a build is a function of `scripts/brclient.source` at that commit. A rollback of `lambda-web` builds the BRClient of the previous `SourceRef`.
- The images and the package are built from the same source tree with the same node major version and yarn version. `.source` records the tree id, so two artifacts can be compared. They are not byte-identical: Next names each build with a random build id, and a few module ids depend on the build directory. A multi-platform image build runs the BRClient stage once, so the amd64 and arm64 images carry the same files.
- Each build downloads the BRClient commits and its npm dependencies from GitHub and the npm registry. On 2 CPUs, `yarn export` took 73 seconds with a 2.6 GB peak resident set. A build fails if GitHub no longer serves a pinned commit.
- `/brclient/` is about 8 MB, down from 18 MB.
- After upstream merges the pull request, the next run of the resolve script pins `main` only. Later runs stay on `main`.
- A pull request that no longer merges into the new `main` stops the build. Rerun the resolve script after the conflict is fixed upstream, or pin `main` only with `--pr none`.

## Alternatives considered

- **Keep the image layer of ADR 0004.** No layer contains the download button.
- **Ask GitHub about the pull request at build time.** The same `SourceRef` would build different BRClients before and after the merge, and a rebuild or rollback could not reproduce a release.
- **Fetch the pull request's head ref and compare it with the pin.** This is equally exact, but any later push to the pull request breaks every rebuild of a `SourceRef` that pins the older head.
- **Commit the BRClient build output.** It adds 8 MB of third-party build output to the history on every BRClient change.
- **Build BRClient per target platform.** The arm64 build would run under emulation on an amd64 builder, and the two platforms would carry separate builds.
