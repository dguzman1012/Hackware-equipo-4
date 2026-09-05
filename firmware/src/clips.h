#pragma once

#include "actuator_set.h"

struct ClipPcm {
    const uint8_t* data;
    uint32_t len;
};

ClipPcm clipPcm(ClipId id);
