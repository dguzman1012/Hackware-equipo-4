#pragma once

constexpr char WIFI_SSID[] = "your-2.4ghz-ssid";
constexpr char WIFI_PASS[] = "your-password";
#ifdef SERVER_IP
constexpr const char* SERVER_IP_OR_NULL = SERVER_IP;
#else
constexpr const char* SERVER_IP_OR_NULL = nullptr;
#endif
