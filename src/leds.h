#pragma once

// Unused output pins. Audio uses 4/16/17. Motors use 25/26/27/33.
constexpr int LED_LEFT = 18;
constexpr int LED_RIGHT = 19;

void ledsBegin();
void ledsOff();
void ledsBoth();
void ledsLeft();
void ledsRight();
