# 0003. Painter billing per step

Status: Accepted

## Context

One painter request can make up to five pictures with models whose prices differ by 3.5 times. `legacyFee` billed `images × price_per_image`, one price per model config, and `saveThread` writes one thread record per request. The design left open whether to extend `legacyFee` or to compute the fee in painter, and whether to write one thread record per request or per step.

## Decision

- `LegacyUsage` and `ResponseData` gain `image_prices`, the price of each image when a provider prices its images itself. When it is present, its sum replaces `images × price_per_image`. Negative or non-numeric entries count as 0. `azure-openai-image` keeps using `images`.
- Painter looks up each picture's price when Bedrock returns it (`image_prices[modelId]`, then `price_per_image`, then the built-in list price, then 0 with a log warning) and passes the list to `saveThread`.
- One thread record per request. It is written in a `finally` block once at least one step ran, so pictures made before a failed step are billed. The completion text is everything painter streamed, which includes one line per step naming the tool, the model and the input pictures.

## Consequences

- The key's balance, the session total and the thread fee all see the exact sum of the step prices.
- The thread record shows which models ran through the step lines in its completion text, not as separate rows.
- A picture is billed once Bedrock returns it, even if storing it in S3 then fails.

## Alternatives considered

- **Compute the fee in painter and pass it as a precomputed fee.** It would add a second way to pass an image fee that overlaps `images`.
- **One thread record per step.** It would split one request across several records and repeat the session update for each.
