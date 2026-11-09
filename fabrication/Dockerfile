# syntax=docker/dockerfile:1.7
# Evarysth · chaîne de fabrication : image de tranchage (Bambu Studio en ligne de commande + Node).
# Voir docs/chaine-fabrication.md (phase 1a) et fabrication/profils/p2s/LISEZMOI.md.
#
# Tout est figé : image de base (empreinte), paquets Ubuntu (instantané daté de snapshot.ubuntu.com),
# AppImage Bambu Studio et Node (sha256). Construction reproductible (même manifeste linux/amd64 à chaque fois ;
# --provenance=false retire l'attestation de construction, horodatée) :
#   docker buildx build --provenance=false --build-arg SOURCE_DATE_EPOCH=0 \
#     --output type=docker,name=evarysth-fabrication:p1a,rewrite-timestamp=true fabrication/
# Lancement : docker run --rm --network none --security-opt seccomp=unconfined … (voir fabrication/bambu-studio)
# Derrière un proxy HTTPS qui intercepte TLS (session de développement seulement) :
#   --network host --build-arg https_proxy=… --build-arg APT_URI=https://snapshot.ubuntu.com \
#   --secret id=ca,src=<bundle CA du proxy>
# (le certificat n'est jamais copié dans l'image ; ces options ne changent pas son contenu).

FROM ubuntu:24.04@sha256:fe81560990fae86dc4743202b2cb4d3df98d0bcf949173cecef15ce1127ef852

ARG SNAPSHOT=20261101T000000Z
ARG APT_URI=http://snapshot.ubuntu.com
ARG BAMBU_VERSION=02.08.02.61
ARG BAMBU_APPIMAGE=BambuStudio_ubuntu24.04-v02.08.02.61-20260820225108.AppImage
ARG BAMBU_SHA256=d501b103fac5424513ec0e8d6bc145fb30719de2c7d94d7320d723740c81a7fd
ARG NODE_VERSION=22.21.1
ARG NODE_SHA256=680d3f30b24a7ff24b98db5e96f294c0070f8f9078df658da1bce1b9c9873c88

ENV DEBIAN_FRONTEND=noninteractive LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC

# Paquets : bibliothèques exigées par bambu-studio (ldd). Pas d'affichage : le tranchage n'en demande pas (essai
# phase 1a) ; la GLFW embarquée ne connaît que Wayland, Xvfb ne servirait à rien.
RUN --mount=type=secret,id=ca,target=/run/secrets/ca,required=false,mode=0444 \
    set -eux; \
    if [ -s /run/secrets/ca ]; then echo 'Acquire::https::CaInfo "/run/secrets/ca";' > /etc/apt/apt.conf.d/99ca-proxy; fi; \
    sed -i "s#^URIs: .*#URIs: ${APT_URI}/ubuntu/${SNAPSHOT}/#" /etc/apt/sources.list.d/ubuntu.sources; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      ca-certificates curl xz-utils \
      libgtk-3-0t64 libwebkit2gtk-4.1-0 libgl1 libegl1 libglu1-mesa \
      libgstreamer1.0-0 libgstreamer-plugins-base1.0-0 libwayland-server0 libsecret-1-0 libdbus-1-3; \
    rm -f /etc/apt/apt.conf.d/99ca-proxy; \
    sed -i "s#^URIs: .*#URIs: http://snapshot.ubuntu.com/ubuntu/${SNAPSHOT}/#" /etc/apt/sources.list.d/ubuntu.sources; \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/* /var/log/apt /var/log/dpkg.log /var/log/alternatives.log \
      /var/cache/ldconfig/aux-cache /var/cache/debconf/*-old /var/lib/dpkg/*-old /var/cache/fontconfig/*; \
    # Identifiants aléatoires créés par dbus/systemd à l'installation : vidés pour une image reproductible.
    : > /etc/machine-id; rm -f /var/lib/dbus/machine-id

# Bambu Studio : AppImage officielle (GitHub bambulab/BambuStudio, release v${BAMBU_VERSION}), extraite (pas de FUSE).
RUN --mount=type=secret,id=ca,target=/run/secrets/ca,required=false,mode=0444 \
    set -eux; CA=""; [ -s /run/secrets/ca ] && CA="--cacert /run/secrets/ca"; \
    cd /tmp; \
    curl -fsSL $CA -o bs.AppImage "https://github.com/bambulab/BambuStudio/releases/download/v${BAMBU_VERSION}/${BAMBU_APPIMAGE}"; \
    echo "${BAMBU_SHA256}  bs.AppImage" | sha256sum -c -; \
    chmod +x bs.AppImage; ./bs.AppImage --appimage-extract >/dev/null; \
    mv squashfs-root /opt/bambu-studio; rm bs.AppImage; \
    # La CLI lit l'identifiant du modèle (P2S : N7, écrit dans le .gcode.3mf) dans machine_full/<modèle>.json,
    # dossier généré chez Bambu Lab mais absent de l'AppImage : on y copie le descripteur « machine_model » livré.
    B=/opt/bambu-studio/resources/profiles/BBL; mkdir -p $B/machine_full; \
    cp "$B/machine/Bambu Lab P2S.json" $B/machine_full/; \
    curl -fsSL $CA -o node.tar.xz "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz"; \
    echo "${NODE_SHA256}  node.tar.xz" | sha256sum -c -; \
    tar -xJf node.tar.xz -C /usr/local --strip-components=1 --no-same-owner \
      --exclude='*/CHANGELOG.md' --exclude='*/README.md' --exclude='*/LICENSE' --exclude='*/include' --exclude='*/share'; \
    rm node.tar.xz

COPY bambu-studio /usr/local/bin/bambu-studio
COPY profils /opt/evarysth/profils

ENV BAMBU_STUDIO_VERSION=${BAMBU_VERSION}
WORKDIR /travail
