#include <Arduino.h>

#include "hola_garu.h"

constexpr int AUDIO_PIN = 4;
constexpr int AUDIO_CHANNEL = 0;
constexpr int AUDIO_TIMER_BITS = 8;
constexpr int PWM_CARRIER_HZ = 125000;

void audioStop() {
    ledcWrite(AUDIO_CHANNEL, 0);
}

void playHolaGaru() {
    const uint32_t stepUs = 1000000UL / HOLA_GARU_RATE;
    uint32_t nextUs = micros();

    for (size_t i = 0; i < HOLA_GARU_LEN; ++i) {
        const uint8_t sample = pgm_read_byte(&HOLA_GARU_PCM[i]);
        ledcWrite(AUDIO_CHANNEL, sample);
        nextUs += stepUs;
        while (static_cast<int32_t>(nextUs - micros()) > 0) {
        }
    }

    audioStop();
}

void setup() {
    Serial.begin(115200);
    delay(1000);

    ledcSetup(AUDIO_CHANNEL, PWM_CARRIER_HZ, AUDIO_TIMER_BITS);
    ledcAttachPin(AUDIO_PIN, AUDIO_CHANNEL);
    audioStop();

    Serial.println("================================");
    Serial.println("PUCCA BOT VOICE READY");
    Serial.println("GPIO4  -> speaker +");
    Serial.println("GND    -> speaker -");
    Serial.println("================================");
}

void loop() {
    Serial.println("HOLA GAUCHO, TE AMO");
    playHolaGaru();
    delay(2500);
}
