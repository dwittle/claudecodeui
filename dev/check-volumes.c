#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

int main() {
    if (setuid(0) != 0) {
        perror("setuid failed");
        return 1;
    }

    printf("=== Gateway Container ===\n");
    system("/usr/bin/podman ps -a | grep cloudcli-gateway");

    printf("\n=== Gateway Volumes ===\n");
    system("/usr/bin/podman inspect cloudcli-gateway 2>/dev/null | grep -A 10 '\"Mounts\"'");

    printf("\n=== Database Location ===\n");
    system("/usr/bin/podman exec cloudcli-gateway ls -la /data/ 2>/dev/null");

    return 0;
}
