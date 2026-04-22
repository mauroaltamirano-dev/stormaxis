#!/usr/bin/env bash
set -euo pipefail

SITE_URL="${1:-${SITE_URL:-}}"
if [[ -z "${SITE_URL}" ]]; then
  echo "Usage: SITE_URL=https://your-domain.com npm run cf:verify-images"
  echo "   or: npm run cf:verify-images -- https://your-domain.com"
  exit 1
fi

SITE_URL="${SITE_URL%/}"

assets=(
  "/images/617568.webp"
  "/images/1132707.webp"
  "/brand/logo.webp"
  "/ranked/legend.thumb.webp"
)

echo "Cloudflare image verification"
echo "============================"
echo "Base URL: ${SITE_URL}"
echo

check_asset() {
  local path="$1"
  local url="${SITE_URL}${path}"

  echo "--- ${path}"
  # warm cache
  curl -sS -o /dev/null -D /tmp/cf_headers_1.txt "$url"
  # second request should usually show HIT if cacheable and warmed
  curl -sS -o /dev/null -D /tmp/cf_headers_2.txt "$url"

  local cache_status
  cache_status="$(grep -i '^cf-cache-status:' /tmp/cf_headers_2.txt | head -n1 | sed 's/\r$//' || true)"
  local cache_control
  cache_control="$(grep -i '^cache-control:' /tmp/cf_headers_2.txt | head -n1 | sed 's/\r$//' || true)"
  local content_type
  content_type="$(grep -i '^content-type:' /tmp/cf_headers_2.txt | head -n1 | sed 's/\r$//' || true)"
  local cf_polished
  cf_polished="$(grep -i '^cf-polished:' /tmp/cf_headers_2.txt | head -n1 | sed 's/\r$//' || true)"

  echo "${content_type:-content-type: (missing)}"
  echo "${cache_control:-cache-control: (missing)}"
  echo "${cache_status:-cf-cache-status: (missing)}"
  if [[ -n "${cf_polished}" ]]; then
    echo "${cf_polished}"
  else
    echo "cf-polished: (missing or not applicable)"
  fi
  echo
}

for path in "${assets[@]}"; do
  check_asset "$path"
done

echo "Done. Expected signals:"
echo "- cf-cache-status: HIT/MISS/REVALIDATED (not BYPASS for static assets)"
echo "- cache-control includes long max-age + immutable (from public/_headers)"
echo "- cf-polished appears if Polish is active and applied"
