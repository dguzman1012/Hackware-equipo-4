#pragma once

#include <cstdint>
#include <optional>

struct SensorFrame {
    std::optional<uint16_t> distCm;
    std::optional<uint16_t> yawDeg;
};
