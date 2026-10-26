# C-407: Release images: the Docker Hub digest check compares against the whole inspect output

Issue: #938

## What happened

The v0.17.0 tag pipeline (Woodpecker repo 9, pipeline #2680, workflow `release-images`, step `images`) failed after the API image was copied to Docker Hub correctly. `chart` and `github-release` were skipped, so the web and all-in-one images were never mirrored and the GitHub Release v0.17.0 does not exist.

The failing line is `deploy/images/release-images.sh:242-244` in `mirror()`:

```sh
copied=$(docker buildx imagetools inspect --format '{{.Manifest.Digest}}' "$hub:$VERSION")
[ "$copied" = "$digest" ] ||
  fail "$hub:$VERSION is $copied, not $digest: the copy is not the same image"
```

On the CI buildx, `--format '{{.Manifest.Digest}}'` printed the full default inspect text (`Name: … MediaType: … Digest: sha256:f813… Manifests: …`), not the bare digest. The digest in that text **is** the expected `sha256:f8131223…`, so the copy was correct and only the check is wrong.

## Fix

Read the copied index digest in a way that yields exactly `sha256:<hex>` on the buildx in the CI image — e.g. `--format '{{json .Manifest}}'` parsed for `.digest`, or the `Digest:` line of the default output. Verify against the buildx version the CI image actually ships. Keep the check (a real mismatch must still fail).

## Acceptance criteria

- `mirror()` compares the bare digest of `$hub:$VERSION` to `$digest` and passes for an identical copy of a multi-arch image with SBOM/provenance attestations.
- A different digest still fails with the existing message.
- If the script has tests (look for a spec/bats/shell test next to `deploy/images/`), add a case for this; otherwise explain in the PR how it was verified locally (e.g. against an existing pushed image).
- No change to what is built, tagged or signed.

Follow-up (not in this card): cut v0.17.1 so the tag pipeline completes (web + all-in-one mirror, chart, GitHub Release).
