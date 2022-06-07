#!/bin/sh
echo '{' > /app/api.json
echo "  \"compiler\": \"${COMPILER_ADDRESS}\"," >> /app/api.json
echo "  \"renderer\": \"${RENDERER_ADDRESS}\"" >> /app/api.json
echo '}' >> /app/api.json
nginx -g 'daemon off;'
