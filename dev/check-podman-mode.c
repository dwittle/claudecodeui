#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

int main() {
    if (setuid(0) != 0) {
        perror("setuid failed");
        return 1;
    }

    printf("=== Podman Info ===\n");
    system("/usr/bin/podman info | grep -i root");

    printf("\n=== Who is running podman ===\n");
    system("ps aux | grep 'podman.*cloudcli-gateway' | grep -v grep");

    return 0;
}
