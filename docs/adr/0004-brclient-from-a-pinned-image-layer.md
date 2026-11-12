# 0004. BRClient for lambda-web from a pinned image layer

Status: Accepted

## Context

The server serves `./brclient` at `/brclient/`. The `ec2` and `ecs` compute types run the public image, and the image's `app/brclient` directory comes from the release pipeline, outside this repository. `scripts/build-web-function-zip.sh` builds the `lambda-web` package from the repository alone. It copied a repository-root `brclient/` when one existed, and nothing created one, so every `lambda-web` package returned 404 at `/brclient/`.

Of the BRClient releases, only app-v1.2.1 includes a web build (`sample-client-for-amazon-bedrock_1.2.1_web.zip`). Later releases carry desktop and mobile installers only. The public image `public.ecr.aws/x6u9o2u4/sample-connector-for-bedrock` serves BRClient v1.2.4 from its `COPY ./dist /app` layer, which holds `app/brclient`.

`WebFnPackage` rebuilds the package only when `SourceRepoUrl`, `SourceRef` or `WebFnBuildId` changes. A rollback builds the previous `SourceRef` again.

## Decision

- `scripts/brclient.pin` names the image repository and the digest of one layer: the `COPY ./dist /app` layer of image 0.0.44 for linux/arm64. A layer digest is the sha256 of the layer's bytes, so the one value is the address, the version and the checksum.
- `scripts/build-web-function-zip.sh` gets an anonymous pull token from `public.ecr.aws`, downloads the blob at that digest, compares its sha256 with the pin, and extracts only `app/brclient` into the package. Any failure stops the build before the zip is made, so the stack update fails at step `build`.
- `brclient/index.html` joins the package's final file check. The copy of a repository-root `brclient/` is removed.
- The buildspec and the template do not change.

## Consequences

- The package is a function of `SourceRepoUrl` at `SourceRef`. A pin change is a commit, a new `SourceRef` rebuilds with it, and a rollback brings the old pin back.
- Each package build downloads about 8 MB from `public.ecr.aws`. Builds of a `SourceRef` fail if that layer is removed from the registry.
- To move to a newer BRClient, take the `COPY ./dist /app` layer digest from the linux/arm64 manifest of a newer image and change `scripts/brclient.pin`.
- The package grows by the 18 MB BRClient tree.

## Alternatives considered

- **Fetch and pin in the buildspec, or a template parameter.** A change to either does not rebuild `WebFnPackage`, so the stack would keep the old package. A later `WebFnBuildId` change would build the old `SourceRef` with the new BRClient. Local builds would still have no BRClient.
- **Download the BRClient v1.2.1 web release.** It is BRClient's own artifact and half the size, but it is older than the v1.2.4 build that the images serve, so `lambda-web` would serve a different BRClient from `ec2` and `ecs`. No later release has a web build to move to.
- **Pin the image index or manifest digest and find the layer at build time.** It adds two fetches, JSON parsing and a rule for which layer holds BRClient, and it still ends at one layer digest.
- **Build BRClient from source at a pinned commit.** It adds a second toolchain and minutes of build time, and the result would differ from what the images serve.
- **Commit the BRClient build to the repository.** It adds 18 MB of third-party build output to the history.
