#pragma once

#include <cstddef>
#include <cstdint>

#include "actuator_set.h"
#include "sensor_frame.h"

constexpr char HELLO_LINE[] = "H 1\n";
constexpr size_t WIRE_MAX = 64;

bool parseSet(const char* line, ActuatorSet& out);
size_t formatTelemetry(char* buf, size_t cap, Seq seqEcho, const SensorFrame& s, uint32_t uptimeMs);
