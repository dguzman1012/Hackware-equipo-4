#include <Arduino.h>

#include "leds.h"
#include "motors.h"

void runStep(const char* name, void (*action)(), void (*showLeds)(), int durationMs) {
    Serial.println(name);
    showLeds();
    action();
    delay(durationMs);
    motorsStop();
    ledsOff();
    delay(400);
}

void setup() {
    Serial.begin(115200);
    delay(1000);
    motorsBegin();
    ledsBegin();

    Serial.println("================================");
    Serial.println("PUCCA BOT MOTORS + LEDS READY");
    Serial.println("D25 -> IN1  left");
    Serial.println("D26 -> IN2  left");
    Serial.println("D27 -> IN3  right");
    Serial.println("D33 -> IN4  right");
    Serial.println("D18 -> LED left  (220 ohm)");
    Serial.println("D19 -> LED right (220 ohm)");
    Serial.println("Lift the wheels before the test.");
    Serial.println("================================");
}

void loop() {
    runStep("FORWARD", motorsForward, ledsBoth, 5000);
    runStep("BACKWARD", motorsBackward, ledsBoth, 5000);
    runStep("ROTATE LEFT", motorsRotateLeft, ledsLeft, 5000);
    runStep("ROTATE RIGHT", motorsRotateRight, ledsRight, 5000);
    Serial.println("PAUSE");
    delay(2500);
}
