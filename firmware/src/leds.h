#pragma once

#include "led_view.h"

constexpr int LED_LEFT = 18;
constexpr int LED_RIGHT = 19;

void ledsBegin();
void ledsShow(const LedFrame& f, uint32_t now);
