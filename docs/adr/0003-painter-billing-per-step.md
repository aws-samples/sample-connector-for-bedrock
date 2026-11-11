# 0003. Painter billing per step

Status: Accepted

## Context

One painter request can make up to five pictures with models whose prices differ by 3.5 times. `legacyFee` billed `images × price_per_image`, one price per model config, and `saveThread` writes one thread record per request. The design left open whether to extend `legacyFee` or to compute the fee in painter, and whether to write one thread record per request or per step.

## Decision

- `LegacyUsage` and `ResponseData` gain `image_prices`, the price of each image when a provider prices its images itself. When it is present, its sum replaces `images × price_per_image`. Negative or non-numeric entries count as 0. `azure-openai-image` keeps using `images`.
- Painter looks up each picture's price when Bedrock returns it (`image_prices[modelId]`, then `price_per_image`, then the built-in list price, then 0 with a log warning) and passes the list to `saveThread`.
- One thread record per picture, written as soon as the picture is stored and streamed. Its fee is that picture's price, and its completion text is what painter streamed since the previous record: the chat model's words, the step line naming the tool, the model and the input pictures, and the picture. A step that makes no picture writes no record. A request that is cut short, for example by the 60-second limit of the `lambda` compute type, has already billed every picture it streamed.

## Consequences

- The key's balance and the session total see the exact sum of the step prices, one record at a time.
- A request with three pictures has three thread records. Each record names its model in its step line.
- Text that the chat model writes after the last picture is not recorded. It carries no fee.

## Alternatives considered

- **Compute the fee in painter and pass it as a precomputed fee.** It would add a second way to pass an image fee that overlaps `images`.
- **One thread record per request, written when the request ends.** It keeps one row per request, but a request that is stopped before it ends (a function timeout, a crash) bills none of the pictures it already streamed.
