#!/bin/sh
envsubst < /backend.conf > /etc/nginx/http.d/backend.conf
exec "$@"
