# 0002. Painter picture sizes and formats

Status: Accepted

## Context

A picture exists in three copies: the S3 copy, the copy the chat model sees, and the copy a Stability model gets. The design fixed the S3 copy (unchanged) and left the other two to the implementation. The documented input limits differ between sources: the Bedrock docs give at least 64 px per side, at most 9,437,184 pixels and an aspect ratio between 1:2.5 and 2.5:1 for the image services; the Stability API gives at most 4,194,304 pixels for remove background; the docs give no limit for Ultra and only the 64 px minimum for SD3.5 Large. `preprocess.scaleDownImage` always writes JPEG, so it drops the alpha channel that remove background produces.

## Decision

- **Chat model copy.** EXIF-rotated, fitted inside 1024 × 1024 px without enlarging, alpha flattened onto white, JPEG quality 80. Five such pictures stay well inside the Bedrock request size limit.
- **Stability copy.** One rule for every tool: each side at least 64 px, aspect ratio between 1:2.5 and 2.5:1, at most 4,194,304 pixels. A picture that is too large is scaled down with its aspect ratio kept. A side or ratio outside the rule cannot be fixed by scaling, so the step fails with a message that names the rule and the picture's size.
- **Format.** JPEG, PNG and WebP keep their format. When no resize or rotation is needed, the original bytes are sent. Other readable formats (GIF, TIFF, AVIF) become PNG, both in S3 and for Stability. HEIC cannot be decoded and is refused with a message that names the formats that work.
- **Output format.** The code sets `output_format`, never the chat model: `png` for remove background so the cut-out keeps its alpha in S3 and into the next step, `jpeg` for the other tools. The S3 key extension and `ContentType` follow it.
- The resize path is a new function. `scaleDownImage` is unchanged.

## Consequences

- A transparent cut-out stays transparent when the next step uses it. Real calls confirmed a remove-background PNG with alpha going into style guide.
- The single rule is stricter than the documented limits of some models. A picture between 4,194,304 and 9,437,184 pixels is scaled down rather than sent as is. The output size of tools that follow the input can be smaller than the upload.
- A wide panorama (more than 2.5:1) is refused even by a model that might accept it. The message tells the user why.

## Alternatives considered

- **Per-model limits.** More precise, but most limits are undocumented or contradictory, and a wrong limit fails at Bedrock with a less clear error.
- **Crop to fit the ratio.** It would change what the user asked to edit without telling them.
