#!/bin/sh
# Renders the nginx config from the environment at container start, then runs
# nginx. The API origin and the gateway secret are runtime values: the secret
# must never be baked into the image or the browser bundle.
set -eu

TEMPLATE=/etc/nginx/nginx.conf.template
TARGET=/tmp/nginx.conf

: "${API_UPSTREAM:=https://dev-customer-assistant-api.si24.ir}"
: "${SAMAN_IDENTITY_SHARED_SECRET:=}"
# Kubernetes usually mounts a secret as a file; accept that shape too.
if [ -z "$SAMAN_IDENTITY_SHARED_SECRET" ] && [ -n "${SAMAN_IDENTITY_SHARED_SECRET_FILE:-}" ] \
    && [ -r "$SAMAN_IDENTITY_SHARED_SECRET_FILE" ]; then
    SAMAN_IDENTITY_SHARED_SECRET=$(tr -d '\r\n' < "$SAMAN_IDENTITY_SHARED_SECRET_FILE")
fi
export API_UPSTREAM SAMAN_IDENTITY_SHARED_SECRET

if [ -z "$SAMAN_IDENTITY_SHARED_SECRET" ]; then
    printf '%s\n' \
        "[entrypoint] SAMAN_IDENTITY_SHARED_SECRET is empty." \
        "[entrypoint] The API answers UNAUTHENTICATED to every /chat and /ingestion call" \
        "[entrypoint] until this container is given the gateway secret (envFrom/secretKeyRef)." \
        >&2
fi

# sed replacement values must not carry the delimiter, an ampersand or a
# backslash, so escape those before substituting.
escape() {
    printf '%s' "$1" | sed -e 's/[\\&|]/\\&/g'
}

if command -v envsubst >/dev/null 2>&1; then
    envsubst '${API_UPSTREAM} ${SAMAN_IDENTITY_SHARED_SECRET}' < "$TEMPLATE" > "$TARGET"
else
    sed -e "s|\${API_UPSTREAM}|$(escape "$API_UPSTREAM")|g" \
        -e "s|\${SAMAN_IDENTITY_SHARED_SECRET}|$(escape "$SAMAN_IDENTITY_SHARED_SECRET")|g" \
        "$TEMPLATE" > "$TARGET"
fi

nginx -t -c "$TARGET" -q
exec nginx -c "$TARGET" -g 'daemon off;'
