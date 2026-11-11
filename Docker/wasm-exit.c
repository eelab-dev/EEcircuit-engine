/* Catch every C exit path, including quit and fatal errors outside controlled_exit. */
#include <emscripten.h>
#include <stdlib.h>

_Noreturn void __real_exit(int status);

_Noreturn void __wrap_exit(int status)
{
    EM_ASM({
        if (Module["onSimulatorExit"]) Module["onSimulatorExit"]($0);
    }, status);
    __real_exit(status);
}
