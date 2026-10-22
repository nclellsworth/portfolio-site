# Nicole Ellsworth — Student Art Portal

A static GitHub Pages starter for parent-controlled student dashboards, instructor-uploaded private artwork, project wishlists, lesson records, and Calendly booking.

## Files to copy to your existing website's root
- `student-login.html` — parent/student sign-in
- `student-portal.html` — private portfolio, dreams, lesson history, booking widget
- `instructor-portal.html` — instructor-only management
- `reset-password.html` — password recovery destination
- `set-password.html` — invitation password setup
- `assets/config.js`, `assets/client.js`, `assets/student.js`, `assets/instructor.js`, `assets/portal.css`
- `supabase/schema.sql` — **do not** host this SQL file; run it from Supabase SQL Editor

No changes to your existing `style.css` are required. Pages inherit your site styles and add portal-specific CSS.

## One-time setup
1. Create a new project at Supabase. Go to **SQL Editor** and run `supabase/schema.sql` exactly once. This is written for a fresh project, not for repeated execution.
2. Under **Authentication > Providers > Email**, keep email/password enabled. **Disable public self sign-up**: users should be created by the instructor through the Supabase Auth dashboard. If email confirmation is used, ensure users have a way to set a password, e.g. an invite/recovery email. Configure **Authentication > URL Configuration**: set the site URL to your real custom domain (`https://nicoleellsworthart.com`) and add both `https://nicoleellsworthart.com/reset-password.html` and `https://nicoleellsworthart.com/set-password.html` to redirect URLs. Add both www versions if serving the www domain. Test from the real HTTPS domain rather than `file://`.
3. In **Authentication > Users**, create an account for yourself. Obtain its `User ID` UUID. In Supabase SQL Editor, run this once with your UUID:
   ```sql
   insert into public.instructors(user_id) values ('REPLACE_WITH_YOUR_AUTH_USER_UUID');
   ```
   **Do not add instructor permissions through your website.**
4. From your Supabase project's **Connect** dialog copy the Project URL and `sb_publishable_...` **publishable** key into `assets/config.js`. **Never** put a secret/service-role key in browser files or GitHub.
5. Replace `CALENDLY_URL` in `assets/config.js` with your public **Calendly event URL**. Use a separate event type for each lesson type if desired; this first version embeds one default event URL.
6. Upload the HTML files and assets folder to your existing GitHub Pages repository. Add to your site navigation:
   ```html
   <li><a href="student-login.html">Student Login</a></li>
   ```
7. To invite a student family, use **Supabase > Authentication > Users** to create/invite the parent account, and then sign into `instructor-portal.html`. Paste their Auth `User ID` and add a student profile. Multiple profiles may share one parent account. Keep passwords private and have the parent change any temporary password.
8. In your instructor dashboard, select the profile, add artwork or a scheduled/completed lesson. In the student dashboard, the parent can maintain the dream-project list.

## Important limitations and safety
- **No automatic Calendly syncing** is included. Calendly sends booking confirmations; you manually add dates to the portal. Integrating validated webhooks requires server-side code/Edge Functions and, depending on Calendly's plan, additional subscription capabilities. Do not put Calendly personal access tokens in static JavaScript.
- The `student-art` bucket is **private**. The portal obtains short-lived signed read URLs after the signed-in user passes RLS. Those URLs can be shared temporarily by someone who receives them, so do not treat screenshots or copied URLs as revocable instantly.
- This is a starter implementation, not a security audit. Before working with children's information, verify consent, data retention, authorization in a second test account, and handling of deletion. Collect minimal personal information (the UI uses display names). Parent accounts are strongly recommended for minors.
- `reset-password.html` is for recovery links, and the configured Supabase email templates/domain settings must be tested before students use it.
- Free Supabase email sending can be limited and may require a custom SMTP configuration for reliable student invitations.
- Private images remain in your Supabase Storage account, not the public GitHub repository.
- The instructor dashboard supports adding records and images, not yet editing/deleting them or a full calendar sync.
- The student page uses an `iframe` for Calendly; if your specific link/configuration disallows embedding, the **Open Calendly** link remains available.
- This uses the `esm.sh` browser CDN for supabase-js v2, so pages need an internet connection; production hardening may pin a specific tested version and vendor the client.

## Security checks before real student enrollment
1. Create two different parent Auth accounts and two students; link each student to its correct account.
2. Sign in as Parent A and verify they cannot read or modify Parent B's `students`, `dream_projects`, `lessons`, or `artworks` through direct Supabase queries. Check storage signed URLs as well.
3. Verify parents cannot add lessons/artwork metadata, cannot upload storage images, and cannot add rows to `instructors`.
4. Verify instructor account can create students, add lessons, upload art, and Parent A can view ONLY its own student's records.
5. Verify password reset and Calendly URLs on your published HTTPS domain.

## Files and code ownership
The Supabase URL and publishable key are **public by design**; policies and authenticated users enforce permissions. Never place student photos in `artImages/` on GitHub Pages if they are meant to be private.

## Invitation password setup

The site includes `set-password.html` for invited users to create their first password. In Supabase **Authentication > URL Configuration**, add `https://nicoleellsworthart.com/set-password.html` to Redirect URLs (and the www version if you serve it). Invite users from **Authentication > Users > Add user > Send invitation**. For Dashboard invitations, set the Site URL to that set-password URL if the Dashboard does not offer a separate invitation redirect field. For an Admin API invitation, pass that URL as `redirectTo`. Keep `reset-password.html` in Redirect URLs for password resets.

Test with a newly invited account: open the email link, enter and confirm a password, then sign in through `student-login.html`. Link the invited account's Auth User ID to a student profile in the instructor portal. The invitation page does not create a student profile.

## Gallery upgrade for an existing portal

Existing artwork remains readable before this upgrade; folder controls, Student inspo, and student uploads become available after the database migration.

Before publishing the updated student and instructor pages, run `supabase/migrations/20261021_student_galleries.sql` once in the Supabase SQL Editor. It adds private Student inspo images, portfolio folders, student uploads and deletion permissions while retaining existing artwork as Unfiled. Do not rerun `schema.sql` against an existing database.

Check with two separate student accounts: each should be able to upload and delete only images for its linked profiles, create and rename folders, and see its own Student inspo board. The instructor should be able to use both boards for any student. Deleting a folder keeps its artwork as Unfiled.

## Session visibility upgrade

Run `supabase/migrations/20261022_lesson_visibility.sql` once in the Supabase SQL Editor before publishing the updated student and instructor pages. Existing sessions remain visible by default. In the instructor portal, select a student and use **Hide from student** or **Restore to student** in Student sessions. Hidden lessons remain in the instructor list but cannot be fetched by linked student accounts.

The student page groups scheduled future sessions under Upcoming. When a session's start time passes, it appears under Past & cancelled with normal-weight text; cancelled sessions appear there immediately. This grouping changes automatically while the page is open. Test the visibility control with a separate student account, not just the instructor's Student view.
