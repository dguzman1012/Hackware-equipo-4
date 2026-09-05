#pragma once

#include <cstddef>

#include <WiFi.h>
#include <WiFiUdp.h>

#include "link_core.h"
#include "sensor_frame.h"

constexpr uint16_t UDP_PORT = 4210;

struct Secrets {
    const char* ssid;
    const char* pass;
    const char* serverIp;
};

class Link {
public:
    void begin(const Secrets& s);
    LinkView tick(uint32_t now, const SensorFrame& sensors);

private:
    LinkCore core_;
    WiFiUDP udp_;
    Secrets secrets_{};
    IPAddress peerIp_;
    bool havePeer_ = false;
    bool udpUp_ = false;
    uint32_t lastReconnectAt_ = 0;

    void wifiStep(uint32_t now);
    void drainInbox(uint32_t now);
    void sendHello();
    void sendDatagram(IPAddress to, const char* data, size_t n);
    void sendTelemetry(const SensorFrame& sensors, uint32_t now);
};
