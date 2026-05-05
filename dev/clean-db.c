#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

int main() {
    if (setuid(0) != 0) {
        perror("setuid failed");
        return 1;
    }

    char *args[] = {
        "/bin/rm",
        "-rf",
        "/space/tucker28/code/claudecodeui/data/gateway",
        NULL
    };

    execv("/bin/rm", args);
    perror("execv failed");
    return 1;
}
