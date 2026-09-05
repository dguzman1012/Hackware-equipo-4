#pragma once

#include <cstdint>
#include <optional>

#include "actuator_set.h"

constexpr uint32_t DEADMAN_MS = 500;
constexpr uint32_t RESEARCH_MS = 5000;
constexpr uint32_t HELLO_MS = 1000;
constexpr uint32_t TELEMETRY_MS = 100;
constexpr uint32_t SEQ_RESTART_WINDOW = 1000;

enum class LinkPhase : uint8_t {
    Offline,
    Searching,
    Linked,
    Lost,
};

enum class AcceptVerdict : uint8_t { Accept, Ignore, Restart };

inline const char* phaseName(LinkPhase p) {
    switch (p) {
        case LinkPhase::Offline:
            return "offline";
        case LinkPhase::Searching:
            return "searching";
        case LinkPhase::Linked:
            return "linked";
        case LinkPhase::Lost:
            return "lost";
    }
    return "?";
}

struct LinkView {
    LinkPhase phase;
    ActuatorSet want;
    Seq lastSeq;
};

struct LinkTick {
    LinkPhase phase;
    ActuatorSet want;
    bool sendHello;
    bool sendTelemetry;
};

constexpr bool seqAccepts(Seq incoming, Seq last) {
    const int32_t d = (int32_t)(incoming - last);
    return d > 0 || d < -1000;
}

class LinkCore {
public:
    void setOnline(bool up);
    AcceptVerdict accept(const ActuatorSet& s, uint32_t now);
    LinkTick tick(uint32_t now);
    Seq lastSeq() const { return lastSeq_; }

private:
    bool online_ = false;
    std::optional<uint32_t> lastSetAt_;
    Seq lastSeq_ = 0;
    ActuatorSet want_ = SAFE_SET;
    uint32_t lastHelloAt_ = 0;
    uint32_t lastTelemetryAt_ = 0;

    LinkPhase phase(uint32_t now) const;
};
