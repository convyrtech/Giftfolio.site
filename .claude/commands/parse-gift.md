# Parse Gift URL

Test the gift URL parsing pipeline with a given Telegram gift link.

## Instructions

1. Take the gift URL from arguments
2. Run the parsing logic:
   - Extract slug from URL
   - Split on last hyphen → collection name + number
   - Convert PascalCase → display name
   - Construct Fragment CDN image URL
3. Test image URL accessibility (use Playwright or fetch)
4. Try fetching metadata from api.changes.tg
5. Display full parsed result

## Arguments
$ARGUMENTS = Telegram gift URL (e.g., https://t.me/nft/EasterEgg-52095)

## Expected Output
```
URL:        https://t.me/nft/EasterEgg-52095
Slug:       EasterEgg-52095
Collection: EasterEgg
Number:     52095
Name:       Easter Egg
Image:      https://nft.fragment.com/gift/easteregg-52095.webp (✅ accessible)
Thumb:      https://fragment.com/file/gifts/easteregg/thumb.webp
Metadata:   { model: "Magic Key", rarity: "2%", ... } or "N/A"
```
