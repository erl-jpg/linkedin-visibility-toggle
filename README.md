# LinkedIn Visibility Toggle

A small Chrome extension (Manifest V3) that opens LinkedIn's **Profile viewing
options** page and selects one of its three visibility modes in a click:

- **Your name and headline** — you appear normally in "Who's viewed your profile"
- **Private profile characteristics** — viewers see only your industry and title
- **Private mode** — you browse anonymously

## Install (unpacked)

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. Pin **LinkedIn Visibility Toggle** from the extensions menu.

## Use

Click the extension icon, then choose a mode — that's it. By default the change
is applied **without leaving your current page**: the extension opens LinkedIn's
settings page in a hidden background tab, selects the option, and closes the tab
automatically. The popup confirms with "Visibility updated."

The **toolbar icon reflects your active mode** at a glance — an eye with a green
dot (your name & headline), amber dot (private characteristics), or a slash with
a gray dot (private mode).

### Prefer to see the page?

Use the small **gear toggle** in the top-right of the popup:

- **Off (default):** apply quietly in the background, no navigation.
- **On:** open LinkedIn's settings page in a normal tab and select the option
  there.

If you're signed out, the background tab can't complete — the extension then
brings the settings tab forward so you can sign in and finish.

## Privacy

The extension only runs on
`https://www.linkedin.com/mypreferences/d/profile-viewing-options`. It does not
read cookies, passwords, messages, connections, or any other page, and it sends
no data anywhere. See the [privacy policy](https://erl-jpg.github.io/linkedin-visibility-toggle/privacy.html).

Not affiliated with, endorsed by, or sponsored by LinkedIn Corporation.
