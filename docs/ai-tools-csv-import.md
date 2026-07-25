# AI Tools CSV Import Format

The backend currently saves AI tools through the admin JSON endpoints, especially:

- `POST /api/admin/tools`
- `POST /api/admin/tools/bulk`

Use `docs/ai-tools-csv-template.csv` as the spreadsheet source, then convert each row into the existing `AdminToolInput` JSON shape before posting to `/api/admin/tools/bulk`.

## Required Fields

- `name`
- `category`
- `shortDescription`

## Recommended Fields

- `slug`
- `rank`
- `subcategory`
- `company`
- `website`
- `domain`
- `favicon`
- `logoUrl`
- `freePlan`
- `freeTrial`
- `pricingModel`
- `startingPriceUsd`
- `pricingNotes`
- `summary`
- `features`
- `bestFor`
- `targetAudience`
- `tags`
- `aiType`
- `modalities`
- `modelProvider`
- `modelNames`
- `apiAvailable`
- `openSource`
- `deploymentType`
- `platforms`
- `integrations`
- `teamCollaboration`
- `security`
- `privacyNotes`
- `status`
- `launchYear`
- `lastVerified`
- `sourceUrl`
- `sourceName`
- `sourceType`
- `pros`
- `cons`
- `editorialVerdict`
- `alternativesNote`
- `faqs`
- `featureNotes`

## CSV Value Rules

- Array fields use `|` inside one CSV cell.
  - Example: `Writing|Coding|Research`
- FAQ fields use `question::answer`, separated by `|`.
  - Example: `Is it free?::Yes it has a free plan.|Does it have API?::Yes.`
- Feature note fields use `feature::benefit`, separated by `|`.
  - Example: `Writing::Draft content faster.|Coding::Explain and debug snippets.`
- Boolean fields use `true` or `false`.
- Nullable fields can be left empty.
- `lastVerified` should use `YYYY-MM-DD`.
- `slug` should be lowercase and URL-safe.
- `sourceUrl` should normally match the official product page.

## Fields Saved by Backend

The current admin API accepts and saves the CSV fields listed above. It also rebuilds `searchText` from these fields, so search can match summaries, descriptions, pricing, tags, model names, platforms, integrations, privacy notes, security notes, source data, pros, cons, FAQs, feature notes, and editorial verdicts. `popularityScore`, `rating`, and `reviewCount` are excluded from `searchText` too, since they're computed after the write, not part of it.

The CSV uses frontend-friendly column names:

- `pros` maps to DB column `prosJson`
- `cons` maps to DB column `consJson`
- `faqs` maps to DB column `faqsJson`
- `featureNotes` maps to DB column `featureNotesJson`

## Complete AiTool Table Coverage

These are all columns in the `AiTool` table and how the CSV/API handles them:

| DB column | CSV/API field | Notes |
| --- | --- | --- |
| `id` | generated | Database id, not imported from CSV. |
| `sourceId` | generated from `sourceName`, `sourceType`, `sourceUrl` | Backend creates or reuses an `AiToolSource` and links the tool. |
| `rank` | `rank` | Optional ranking number. |
| `name` | `name` | Required. |
| `slug` | `slug` | Optional; backend generates from name when empty. |
| `category` | `category` | Required. |
| `subcategory` | `subcategory` | Defaults to category when empty. |
| `company` | `company` | Defaults to tool name when empty. |
| `website` | `website` | Falls back to `sourceUrl` when empty. |
| `domain` | `domain` | Extracted from website when empty. |
| `favicon` | `favicon` | Backend creates a Google favicon URL when empty and domain exists. |
| `logoUrl` | `logoUrl` | Optional product/logo image URL. |
| `freePlan` | `freePlan` | Defaults to `Unknown`. |
| `freeTrial` | `freeTrial` | Defaults to `false`. |
| `pricingModel` | `pricingModel` | Defaults to `Unknown`. |
| `startingPriceUsd` | `startingPriceUsd` | Optional number. |
| `pricingNotes` | `pricingNotes` | Optional text. |
| `shortDescription` | `shortDescription` | Required. |
| `summary` | `summary` | Long SEO/editorial summary. |
| `features` | `features` | `|` separated list. |
| `bestFor` | `bestFor` | `|` separated list. |
| `targetAudience` | `targetAudience` | `|` separated list. |
| `tags` | `tags` | `|` separated list. |
| `aiType` | `aiType` | `|` separated list. |
| `modalities` | `modalities` | `|` separated list. |
| `modelProvider` | `modelProvider` | `|` separated list. |
| `modelNames` | `modelNames` | `|` separated list. |
| `apiAvailable` | `apiAvailable` | Boolean. |
| `openSource` | `openSource` | Boolean. |
| `deploymentType` | `deploymentType` | `|` separated list. |
| `platforms` | `platforms` | `|` separated list. |
| `integrations` | `integrations` | `|` separated list. |
| `teamCollaboration` | `teamCollaboration` | Boolean or empty. |
| `security` | `security` | `|` separated list. |
| `privacyNotes` | `privacyNotes` | Optional text. |
| `popularityScore` | not imported | Computed automatically by the backend's stats recompute from real engagement (views, saves, compares, searches) — a `popularityScore` CSV column, if present, is ignored. |
| `rating` | not imported | Computed automatically from the `Review` table on every review write — a `rating` CSV column, if present, is ignored. |
| `reviewCount` | not imported | Computed automatically alongside `rating` — a `reviewCount` CSV column, if present, is ignored. |
| `status` | `status` | Defaults to `Active`. |
| `launchYear` | `launchYear` | Optional year. |
| `lastVerified` | `lastVerified` | `YYYY-MM-DD`; saves as date. |
| `sourceUrl` | `sourceUrl` | Official source URL. |
| `sourceType` | `sourceType` | Also used for source relation. |
| `prosJson` | `pros` | `|` separated list. |
| `consJson` | `cons` | `|` separated list. |
| `editorialVerdict` | `editorialVerdict` | Optional SEO/editorial verdict. |
| `alternativesNote` | `alternativesNote` | Optional comparison note. |
| `faqsJson` | `faqs` | `question::answer` pairs separated by `|`. |
| `featureNotesJson` | `featureNotes` | `feature::benefit` pairs separated by `|`. |
| `searchText` | generated | Backend rebuilds from all searchable fields. |
| `createdAt` | generated | Database timestamp. |
| `updatedAt` | generated | Database timestamp. |

Do not manually import generated/internal DB columns from CSV:

- `id`
- `sourceId`
- `searchText`
- `popularityScore`
- `rating`
- `reviewCount`
- `createdAt`
- `updatedAt`
