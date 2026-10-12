# Recorded price observations

Files here are written by `PRICE_MODE=record` (one JSON file per flight or hotel search) and read by `PRICE_MODE=replay`. Each file holds the search query, the provider's offers, the original `observedAt` time and a public search URL. No API keys are stored.

Replayed prices are always labeled as recorded observations with their original date; they are never presented as current prices.

Check the provider's terms of service before committing recordings to a shared or public repository.
