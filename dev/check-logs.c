#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

int main() {
    if (setuid(0) != 0) {
        perror("setuid failed");
        return 1;
    }

    // Show all cloudcli containers
    printf("=== Containers ===\n");
    system("/usr/bin/podman ps -a | grep cloudcli");

    printf("\n=== Gateway Logs (last 30 lines) ===\n");
    system("/usr/bin/podman logs cloudcli-gateway 2>&1 | tail -30");

    printf("\n=== Worker container (if exists) ===\n");
    system("/usr/bin/podman ps -a | grep cloudcli-user");

    printf("\n=== Worker Logs (if exists) ===\n");
    system("/usr/bin/podman logs cloudcli-user-1 2>&1 | tail -20");

    return 0;
}
