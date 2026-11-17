---
version: 1
slug: "public-privacy-html"
primary_target: "public/privacy.html"
related_targets: ["public/terms.html","src/pages/LoginPage.tsx"]
---

# Public Legal Pages

Scope: Static, public Privacy Policy and Terms of Service pages linked from the login screen. Visitor mode: Read.

Audience and task: Shop staff, shop administrators, customers whose details may appear in shop records, and OAuth reviewers need to read how Devi Times handles information and what app use requires without signing in.

Content and constraints: Explain local device storage, queued offline changes and sync, account/profile data, business and customer records, role-based access, Google sign-in and optional Google Drive backups, third-party services, and the limits of the app's role in payment processing. State no invented retention period, contact email, mailing address, legal entity, or jurisdiction. Direct privacy questions to the shop administrator through the established shop channel. Keep the pages publicly accessible without a React hash route.

Unresolved: The operator's legal entity, a public support email, and governing jurisdiction were not supplied. The documents need legal review before production publication.

## Direction contract

THESIS: A scan-first facts ledger helps readers understand device storage, database sync, and optional Drive backup before they read the full policy; the overview never replaces the complete legal text.

OWN-WORLD: Keep the existing Devi Times identity: Google Sans-style system typography, neutral gray and white surfaces, dark readable ink, Google blue for navigation, and the restrained warm-gold brand accent. Use strong page-level hierarchy and fine table rules, not decorative cards or color-coded legal meaning.

STORY: Readers arrive from login, select Privacy or Terms, scan a clearly labeled overview, then follow the contents links into the complete policy. Shop administrators remain the contact route for questions and data requests.

FIRST VIEWPORT: A compact Devi Times masthead links Privacy, Terms, and sign-in. Below it, show the document title and factual introduction, a clearly labeled overview table, then the start of the full text beside ordinary contents links. Preserve a single-column reading measure below the table.

FORM: Disclosure Ledger, candidate 1 on the ranked grounded list and the third card in reroll round 1; seed:bfd8921157972add.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
