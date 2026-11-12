# A systemd container that behaves like a fresh cloud server, for
# scripts/test-server-docker.sh. wireguard-go stands in for the kernel
# module, which test hosts often lack.
ARG BASE=ubuntu:24.04
FROM ${BASE}
ENV container=docker
RUN apt-get update -q && DEBIAN_FRONTEND=noninteractive apt-get install -y -q --no-install-recommends \
      systemd systemd-sysv iproute2 ca-certificates curl dbus dnsutils procps >/dev/null && apt-get clean
RUN systemctl mask systemd-udevd.service systemd-udevd-kernel.socket systemd-udevd-control.socket \
      getty.target console-getty.service systemd-networkd-wait-online.service systemd-resolved.service || true
# SSH with a root password, like a freshly created cloud server.
RUN apt-get update -q && DEBIAN_FRONTEND=noninteractive apt-get install -y -q --no-install-recommends openssh-server >/dev/null && \
    apt-get clean && echo 'root:meridian-test-password' | chpasswd && \
    sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin yes/; s/^#\?PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config && \
    (systemctl enable ssh.service || systemctl enable ssh.socket || true)
COPY wireguard-go /usr/local/bin/wireguard-go
STOPSIGNAL SIGRTMIN+3
CMD ["/sbin/init"]
