#include "voice.h"

#include <Arduino.h>
#include <driver/i2s.h>

#include "clips.h"

constexpr int PIN_BCLK = 16;
constexpr int PIN_LRC = 17;
constexpr int PIN_DIN = 4;
constexpr uint32_t VOICE_RATE = 16000;
constexpr size_t CHUNK = 256;

static const uint8_t* g_cursor = nullptr;
static uint32_t g_left = 0;

void voiceBegin() {
    i2s_config_t cfg = {};
    cfg.mode = static_cast<i2s_mode_t>(I2S_MODE_MASTER | I2S_MODE_TX);
    cfg.sample_rate = VOICE_RATE;
    cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT;
    cfg.channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT;
    cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
    cfg.intr_alloc_flags = 0;
    cfg.dma_buf_count = 6;
    cfg.dma_buf_len = 256;
    cfg.use_apll = false;
    cfg.tx_desc_auto_clear = true;
    cfg.fixed_mclk = 0;

    i2s_pin_config_t pins = {};
    pins.mck_io_num = I2S_PIN_NO_CHANGE;
    pins.bck_io_num = PIN_BCLK;
    pins.ws_io_num = PIN_LRC;
    pins.data_out_num = PIN_DIN;
    pins.data_in_num = I2S_PIN_NO_CHANGE;

    i2s_driver_install(I2S_NUM_0, &cfg, 0, nullptr);
    i2s_set_pin(I2S_NUM_0, &pins);
}

void voiceStep(ClipId start) {
    if (start != ClipId::None) {
        const ClipPcm clip = clipPcm(start);
        g_cursor = clip.data;
        g_left = clip.len;
    }
    if (g_left == 0 || g_cursor == nullptr) return;

    int32_t frames[CHUNK * 2];
    const size_t n = g_left < CHUNK ? g_left : CHUNK;
    for (size_t i = 0; i < n; ++i) {
        const int16_t s16 = static_cast<int16_t>(pgm_read_byte(g_cursor + i) - 128) << 8;
        const int32_t s32 = static_cast<int32_t>(s16) << 16;
        frames[i * 2] = s32;
        frames[i * 2 + 1] = s32;
    }

    size_t written = 0;
    i2s_write(I2S_NUM_0, frames, n * 8, &written, 0);
    const size_t advanced = written / 8;
    g_cursor += advanced;
    g_left -= advanced;
}

bool voiceBusy() {
    return g_left != 0;
}
