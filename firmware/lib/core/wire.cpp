#include "wire.h"

#include <cstdio>

static Pwm clampPwm(int v) {
    if (v > 255) return 255;
    if (v < -255) return -255;
    return static_cast<Pwm>(v);
}

static ServoDeg clampDeg(int v) {
    if (v > 180) return 180;
    if (v < 0) return 0;
    return static_cast<ServoDeg>(v);
}

bool parseSet(const char* line, ActuatorSet& out) {
    unsigned long seq = 0;
    int l = 0;
    int r = 0;
    int d1 = 0;
    int d2 = 0;
    int t = 0;
    if (std::sscanf(line, "S %lu %d %d %d %d %d", &seq, &l, &r, &d1, &d2, &t) != 6) {
        return false;
    }
    if (t < 0 || t > 4) return false;
    out = ActuatorSet{
        static_cast<Seq>(seq),
        clampPwm(l),
        clampPwm(r),
        clampDeg(d1),
        clampDeg(d2),
        static_cast<Tone>(t),
    };
    return true;
}

size_t formatTelemetry(char* buf, size_t cap, Seq seqEcho, const SensorFrame& s, uint32_t uptimeMs) {
    const int n = std::snprintf(
        buf,
        cap,
        "T %lu %d %d %lu\n",
        (unsigned long)seqEcho,
        s.distCm ? (int)*s.distCm : -1,
        s.yawDeg ? (int)*s.yawDeg : -1,
        (unsigned long)uptimeMs);
    return (n < 0 || (size_t)n >= cap) ? 0 : (size_t)n;
}
