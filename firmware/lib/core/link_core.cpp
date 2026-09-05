#include "link_core.h"

LinkPhase LinkCore::phase(uint32_t now) const {
    if (!online_) return LinkPhase::Offline;
    if (!lastSetAt_) return LinkPhase::Searching;
    const uint32_t age = now - *lastSetAt_;
    if (age < DEADMAN_MS) return LinkPhase::Linked;
    if (age < RESEARCH_MS) return LinkPhase::Lost;
    return LinkPhase::Searching;
}

void LinkCore::setOnline(bool up) {
    if (online_ && !up) {
        want_ = SAFE_SET;
        lastSetAt_.reset();
    }
    online_ = up;
}

AcceptVerdict LinkCore::accept(const ActuatorSet& s, uint32_t now) {
    if (!online_ || !seqAccepts(s.seq, lastSeq_)) return AcceptVerdict::Ignore;
    const int32_t d = (int32_t)(s.seq - lastSeq_);
    const AcceptVerdict v = d < -static_cast<int32_t>(SEQ_RESTART_WINDOW)
        ? AcceptVerdict::Restart
        : AcceptVerdict::Accept;
    lastSeq_ = s.seq;
    lastSetAt_ = now;
    want_ = s;
    return v;
}

LinkTick LinkCore::tick(uint32_t now) {
    const LinkPhase p = phase(now);
    LinkTick t{p, want_, false, false};
    if (p == LinkPhase::Searching && now - lastHelloAt_ >= HELLO_MS) {
        lastHelloAt_ = now;
        t.sendHello = true;
    }
    if (p != LinkPhase::Offline && now - lastTelemetryAt_ >= TELEMETRY_MS) {
        lastTelemetryAt_ = now;
        t.sendTelemetry = true;
    }
    return t;
}
