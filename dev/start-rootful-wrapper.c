#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/types.h>

int main(int argc, char *argv[]) {
    // Set real and effective uid to root
    if (setuid(0) != 0) {
        perror("setuid failed");
        return 1;
    }

    // Execute the start script
    char *script_args[] = {
        "/bin/bash",
        "/space/tucker28/code/claudecodeui/start-rootful.sh",
        NULL
    };

    execv("/bin/bash", script_args);

    // If execv returns, it failed
    perror("execv failed");
    return 1;
}
