# Releasing Invite Preview

## Repository setup

Invite Preview is maintained as a standalone public repository:

- Repository: <https://github.com/PM84/thunderbird-invite-preview>
- Issues: <https://github.com/PM84/thunderbird-invite-preview/issues>
- Privacy policy: <https://github.com/PM84/thunderbird-invite-preview/blob/main/PRIVACY.md>
- Security reports: <https://github.com/PM84/thunderbird-invite-preview/security/advisories/new>

The `main` branch must pass the `CI` workflow before changes are merged.

## First addons.thunderbird.net submission

The first listed version requires one manual submission because the listing must
be created with its name, summary, description, category, license, support
links, privacy policy, screenshots, and Experiment reviewer notes.

1. Sign in to <https://addons.thunderbird.net/developers/>.
2. Submit `invite-preview-1.0.0.xpi` as a listed add-on.
3. Use the copy in `docs/atn-listing.md` for the listing and reviewer notes.
4. Select the MPL-2.0 license and add the repository, issue tracker, privacy
   policy, and security contact URLs listed above.
5. Complete the manual test plan and attach screenshots that contain no personal
   data.
6. Wait for the Experiment review and approval.

The first GitHub tag may be pushed before ATN credentials are configured. The
release workflow will create the GitHub release and skip ATN submission. Upload
that XPI manually for the initial listing.

## Enable automatic ATN submissions

After the ATN listing exists:

1. Generate JWT credentials at
   <https://addons.thunderbird.net/developers/addon/api/key/>.
2. In the GitHub repository, open **Settings > Secrets and variables > Actions**.
3. Add repository secrets named `ATN_API_KEY` and `ATN_API_SECRET`.

Never store these values in files, commits, workflow logs, or issue comments.

## Publish a subsequent release

1. Update the version in `manifest.json`, `package.json`, and
   `package-lock.json`.
2. Add the release entry to `CHANGELOG.md`.
3. Run:

   ```bash
   nvm use
   npm ci
   npm run check
   npm audit
   ```

4. Commit and push the release change to `main`.
5. Create and push the matching tag:

   ```bash
   git tag -a v1.0.1 -m "Invite Preview 1.0.1"
   git push origin v1.0.1
   ```

The `Release` workflow then verifies the tag and all version files, runs the
complete release gate, builds a reproducible XPI, creates a source archive,
submits the listed version through the ATN API, and creates the GitHub release
with both files attached.

ATN submission is automatic, but publication is not. Listed versions that use a
Thunderbird Experiment remain unavailable until Thunderbird reviewers approve
them.
