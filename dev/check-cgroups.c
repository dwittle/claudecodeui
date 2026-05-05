#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

int main() {
    if (setuid(0) != 0) {
        perror("setuid failed");
        return 1;
    }

    printf("=== Cgroup Version ===\n");
    system("stat -fc %T /sys/fs/cgroup/");

    printf("\n=== Available Controllers ===\n");
    system("cat /sys/fs/cgroup/cgroup.controllers 2>/dev/null || echo 'Cgroup v1 or controllers not readable'");

    printf("\n=== Podman Cgroup Subtree ===\n");
    system("cat /sys/fs/cgroup/user.slice/user-25905.slice/cgroup.subtree_control 2>/dev/null || echo 'Not found'");

    printf("\n=== Check if CPU controller is available in root ===\n");
    system("grep -w cpu /sys/fs/cgroup/cgroup.controllers 2>/dev/null && echo 'CPU controller available' || echo 'CPU controller NOT available'");

    return 0;
}
