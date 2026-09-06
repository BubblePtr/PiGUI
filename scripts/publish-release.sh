#!/usr/bin/env bash
set -euo pipefail

: "${GH_REPO:?}" "${RELEASE_TAG:?}" "${VERSION:?}" "${PRERELEASE:?}" "${DMG_NAME:?}" "${RUNNER_TEMP:?}" "${GITHUB_STEP_SUMMARY:?}"

# A published version is immutable, including when a workflow is re-run.
gh api --paginate "repos/$GH_REPO/releases" > "$RUNNER_TEMP/pigui-releases.json"
existing=$(jq -r --arg tag "$RELEASE_TAG" '.[] | select(.tag_name == $tag) | .draft' "$RUNNER_TEMP/pigui-releases.json")
if [[ "$existing" == false ]]; then
  echo '::error::This release is already published; create a new version instead.'
  exit 1
fi
if [[ "$existing" == true ]]; then
  gh release upload "$RELEASE_TAG" "dist/$DMG_NAME" dist/SHA256SUMS.txt --clobber
else
  args=(--draft --verify-tag --title "PiGUI $VERSION" --generate-notes)
  if [[ "$PRERELEASE" == true ]]; then args+=(--prerelease); fi
  gh release create "$RELEASE_TAG" "dist/$DMG_NAME" dist/SHA256SUMS.txt "${args[@]}"
fi

# Keep incomplete uploads private; only publish after both assets are present.
latest=true
if [[ "$PRERELEASE" == true ]]; then latest=false; fi
gh release edit "$RELEASE_TAG" --draft=false --prerelease="$PRERELEASE" --latest="$latest"
gh release view "$RELEASE_TAG" --json url --jq '"Release: " + .url' >> "$GITHUB_STEP_SUMMARY"
