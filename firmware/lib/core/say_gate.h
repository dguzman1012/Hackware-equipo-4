#pragma once

#include <cstdint>

#include "actuator_set.h"
#include "link_core.h"

constexpr uint32_t SAY_STALE_MS = 1500;

class SayGate {
public:
    ClipId step(const LinkView& link, uint32_t now);

private:
    bool seeded_ = false;
    uint8_t lastToken_ = 0;
    uint32_t lastFreshAt_ = 0;
};
