# RouteFlex — Supabase Email Templates

Branded email templates for all Supabase Auth emails.

## Templates

| File | Supabase template |
|---|---|
| `confirm-signup.html` | Confirm signup |
| `reset-password.html` | Reset password |
| `magic-link.html` | Magic link |
| `invite-user.html` | Invite user |

## Setup

### 1. Host the logo assets

Email clients (Gmail, Outlook) strip inline SVGs and don't load Google Fonts.
The templates use a text wordmark fallback by default, but for the icon you need a hosted PNG.

**Steps:**
1. Open `routeflex-brand-system.html` in Chrome
2. Screenshot the icon (48×48 "Wide · Heavy" variant — the one marked "Selected")
3. Export at 2× (96×96px) as a PNG → `routeflex-icon.png`
4. Also export the full lockup (icon + wordmark) as `routeflex-logo-light.png`
5. Upload both to Supabase Storage → bucket: `brand` (set to public)
6. Replace `https://YOUR_PROJECT.supabase.co/storage/v1/object/public/brand/` in each template
   with your actual Supabase project URL

Alternatively, convert `routeflex-icon.svg` (in this folder) to PNG using any SVG-to-PNG tool.

### 2. Paste into Supabase dashboard

1. Go to **Supabase Dashboard → Authentication → Email Templates**
2. For each template type, select the template and paste the HTML
3. Save

### 3. (Optional) Use local templates with config.toml

If you want to manage templates as code, create `supabase/config.toml` and reference the files:

```toml
[auth.email.template.confirmation]
subject = "Confirm your RouteFlex account"
content_path = "./templates/confirm-signup.html"

[auth.email.template.recovery]
subject = "Reset your RouteFlex password"
content_path = "./templates/reset-password.html"

[auth.email.template.magic_link]
subject = "Your RouteFlex sign-in link"
content_path = "./templates/magic-link.html"

[auth.email.template.invite]
subject = "You've been invited to RouteFlex"
content_path = "./templates/invite-user.html"
```

## Design notes

- **Colors**: Electric Blue `#1D6FFF`, Ink `#0F1623`, Off White `#F3F3F0`
- **Font**: System font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial`) — Google Fonts don't load in email
- **Wordmark**: Georgia serif used as a fallback approximation of Darker Grotesque's weight; replace with an image if exact brand match is required
- **Layout**: Table-based for Outlook compatibility; max-width 560px
- **Template variables**: `{{ .ConfirmationURL }}` — standard Supabase Go template syntax
