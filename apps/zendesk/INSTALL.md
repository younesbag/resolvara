# Install Resolvara in your Zendesk (private app, about 3 minutes)

You need a Zendesk **administrator** account. The app runs in your browser inside Zendesk: it reads your own
tickets through Zendesk's app framework with your signed-in session, stores nothing and sends nothing outside
your account. Source code: https://github.com/younesbag/resolvara

## 1. Upload

1. Download `resolvara-zendesk-<version>.zip` (do not unzip it).
2. In Zendesk, open **Admin Center → Apps and integrations → Apps → Zendesk Support apps**.
3. Click **Upload private app** (top right).
4. App name: `Resolvara`. App file: the zip. Click **Upload**, then **Upload** again on Zendesk's notice
   about private apps.
5. Click **Install**. Optionally, under **Enable role restrictions**, limit it to Administrators.

## 2. Run an audit

1. Open Agent Workspace and click the Resolvara icon in the left bar.
2. Under **Read from this Zendesk**, pick a period (30, 60 or 90 days), then **Run audit**. Reading uses Zendesk's
   incremental export, which only administrators can call; large accounts take a few minutes.
3. Or choose **Upload an export file** to audit a CSV instead.

The results show how many AI-agent resolutions were billed and how many pass the strict test (no repeat
contact within 7 days, no reopen, no human reply after the AI, no bad CSAT), with the flagged ticket ids and a
dispute CSV you can download.

## 3. Remove it

Admin Center → Apps and integrations → Zendesk Support apps → Resolvara → **Uninstall**. Nothing is left
behind: the app keeps no data.

Questions: reply to the email you got, or open an issue on GitHub.
