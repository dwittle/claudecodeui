#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

int main() {
    if (setuid(0) != 0) {
        perror("setuid failed");
        return 1;
    }

    char *args[] = {
        "/usr/bin/podman",
        "ps",
        NULL
    };

    execv("/usr/bin/podman", args);
    perror("execv failed");
    return 1;
}
