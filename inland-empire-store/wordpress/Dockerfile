# =============================================================================
# WordPress + PHP 8.2-FPM image for Inland Empire Electronics.
# Based on the official multi-arch image (works on amd64 and arm64 / Pi 4-5).
# Adds the PHP extensions WooCommerce + Redis object cache need, plus WP-CLI.
# =============================================================================
FROM wordpress:php8.2-fpm-alpine

# --- PHP extensions ----------------------------------------------------------
# The base image already bundles: mysqli, gd, exif, etc.
# We add the Redis extension (PECL) and ensure imagick/intl/zip are present.
RUN set -eux; \
    apk add --no-cache \
        less \
        bash \
        mariadb-client \
        imagemagick \
        $PHPIZE_DEPS \
        imagemagick-dev \
        icu-dev \
        libzip-dev; \
    pecl install redis imagick; \
    docker-php-ext-enable redis imagick; \
    docker-php-ext-configure intl; \
    docker-php-ext-install -j"$(nproc)" intl zip exif; \
    apk del --no-network $PHPIZE_DEPS; \
    rm -rf /tmp/pear

# --- WP-CLI ------------------------------------------------------------------
RUN curl -fsSL -o /usr/local/bin/wp \
        https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar \
    && chmod +x /usr/local/bin/wp

# php.ini overrides are bind-mounted at runtime (see docker-compose.yml).
