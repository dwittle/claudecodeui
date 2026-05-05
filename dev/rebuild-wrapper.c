#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

int main() {
    if (setuid(0) != 0) {
        perror("setuid failed");
        return 1;
    }

    char *args[] = {
        "/bin/bash",
        "/space/tucker28/code/claudecodeui/rebuild-and-restart.sh",
        NULL
    };

    execv("/bin/bash", args);
    perror("execv failed");
    return 1;
}
