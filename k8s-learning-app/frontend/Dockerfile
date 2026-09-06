# syntax=docker/dockerfile:1

# ---------- build stage ----------
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---------- runtime stage ----------
# The result is a pile of static files. Nginx serves them; Node is not needed at
# runtime at all, which takes the image from ~200MB to ~50MB.
FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Listen on 8080, not 80. Ports below 1024 need NET_BIND_SERVICE, and the whole
# point of the securityContext in the Deployment is to drop every capability.
RUN sed -i 's/listen  *80;/listen 8080;/' /etc/nginx/conf.d/default.conf 2>/dev/null || true \
 && sed -i 's#pid  */run/nginx.pid;#pid /tmp/nginx.pid;#' /etc/nginx/nginx.conf \
 && chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/log/nginx \
 && touch /tmp/nginx.pid && chown nginx:nginx /tmp/nginx.pid

USER nginx
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
