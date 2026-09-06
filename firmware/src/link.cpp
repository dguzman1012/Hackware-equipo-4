#include "link.h"

#include "wire.h"

void Link::begin(const Secrets& s) {
    secrets_ = s;
    WiFi.persistent(false);
    WiFi.mode(WIFI_STA);
    WiFi.setSleep(false);
    WiFi.setAutoReconnect(true);
    WiFi.disconnect(true, true);
    delay(100);
    Serial.printf("[wifi] begin ssid=%s\n", s.ssid);
    WiFi.begin(s.ssid, s.pass);
    lastReconnectAt_ = millis();
}

LinkView Link::tick(uint32_t now, const SensorFrame& sensors) {
    wifiStep(now);
    drainInbox(now);
    const LinkTick t = core_.tick(now);
    if (t.sendHello) sendHello();
    if (t.sendTelemetry && havePeer_) sendTelemetry(sensors, now);
    return {t.phase, t.want, core_.lastSeq()};
}

void Link::wifiStep(uint32_t now) {
    const wl_status_t st = WiFi.status();
    const int code = static_cast<int>(st);
    if (code != lastStatus_) {
        lastStatus_ = code;
        if (st == WL_CONNECTED) {
            Serial.printf("[wifi] up ip=%s\n", WiFi.localIP().toString().c_str());
        } else {
            Serial.printf("[wifi] status=%d\n", code);
        }
    }

    const bool up = st == WL_CONNECTED;
    if (up && !udpUp_) {
        udpUp_ = udp_.begin(UDP_PORT);
    }
    if (!up && udpUp_) {
        udp_.stop();
        udpUp_ = false;
        havePeer_ = false;
    }
    if (!up && now - lastReconnectAt_ >= 20000) {
        lastReconnectAt_ = now;
        Serial.println("[wifi] retry");
        WiFi.disconnect();
        WiFi.begin(secrets_.ssid, secrets_.pass);
    }
    core_.setOnline(up && udpUp_);
}

void Link::drainInbox(uint32_t now) {
    char buf[WIRE_MAX];
    while (udpUp_ && udp_.parsePacket() > 0) {
        const int n = udp_.read(buf, sizeof buf);
        if (n <= 0 || n == static_cast<int>(sizeof buf)) continue;
        buf[n] = '\0';
        ActuatorSet s;
        if (!parseSet(buf, s)) continue;
        const AcceptVerdict v = core_.accept(s, now);
        if (v == AcceptVerdict::Ignore) continue;
        if (v == AcceptVerdict::Restart) {
            Serial.printf("[link] restart seq=%lu\n", static_cast<unsigned long>(s.seq));
        }
        peerIp_ = udp_.remoteIP();
        havePeer_ = true;
    }
}

void Link::sendDatagram(IPAddress to, const char* data, size_t n) {
    udp_.beginPacket(to, UDP_PORT);
    udp_.write(reinterpret_cast<const uint8_t*>(data), n);
    udp_.endPacket();
}

void Link::sendHello() {
    if (secrets_.serverIp) {
        IPAddress to;
        to.fromString(secrets_.serverIp);
        sendDatagram(to, HELLO_LINE, sizeof HELLO_LINE - 1);
        return;
    }
    sendDatagram(IPAddress(255, 255, 255, 255), HELLO_LINE, sizeof HELLO_LINE - 1);
    const uint32_t ip = static_cast<uint32_t>(WiFi.localIP());
    const uint32_t mask = static_cast<uint32_t>(WiFi.subnetMask());
    // Some routers drop 255.255.255.255 and still forward the subnet broadcast.
    sendDatagram(IPAddress(ip | ~mask), HELLO_LINE, sizeof HELLO_LINE - 1);
}

void Link::sendTelemetry(const SensorFrame& sensors, uint32_t now) {
    char buf[WIRE_MAX];
    const size_t n = formatTelemetry(buf, sizeof buf, core_.lastSeq(), sensors, now);
    if (n == 0) return;
    sendDatagram(peerIp_, buf, n);
}
