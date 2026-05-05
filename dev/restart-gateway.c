#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

int main() {
    if (setuid(0) != 0) {
        perror("setuid failed");
        return 1;
    }

    // Stop and remove gateway
    system("/usr/bin/podman stop cloudcli-gateway 2>/dev/null");
    system("/usr/bin/podman rm cloudcli-gateway 2>/dev/null");

    // Remove database
    system("/bin/rm -rf /space/tucker28/code/claudecodeui/data/gateway");
    system("/bin/mkdir -p /space/tucker28/code/claudecodeui/data/gateway");

    // Start gateway again
    char *args[] = {
        "/bin/bash",
        "/space/tucker28/code/claudecodeui/start-rootful.sh",
        NULL
    };

    execv("/bin/bash", args);
    perror("execv failed");
    return 1;
}
