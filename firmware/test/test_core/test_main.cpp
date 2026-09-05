#include <unity.h>

#include "failsafe.h"
#include "led_view.h"
#include "link_core.h"
#include "say_gate.h"
#include "wire.h"

static ActuatorSet setOf(Seq seq, Pwm left = 0, Pwm right = 0, Tone tone = Tone::Silent,
                         Utterance say = SAY_NONE) {
    return ActuatorSet{seq, left, right, 90, 90, tone, say};
}

static LinkView viewOf(LinkPhase phase, Utterance say, Seq seq = 1) {
    return LinkView{phase, setOf(seq, 0, 0, Tone::Silent, say), seq};
}

static Utterance utter(uint8_t token, ClipId clip) {
    return Utterance{token, clip};
}

void test_parse_set_exact_example() {
    ActuatorSet s{};
    TEST_ASSERT_TRUE(parseSet("S 1043 180 -180 90 90 0\n", s));
    TEST_ASSERT_EQUAL_UINT32(1043, s.seq);
    TEST_ASSERT_EQUAL_INT16(180, s.left);
    TEST_ASSERT_EQUAL_INT16(-180, s.right);
    TEST_ASSERT_EQUAL_UINT8(90, s.deg1);
    TEST_ASSERT_EQUAL_UINT8(90, s.deg2);
    TEST_ASSERT_TRUE(s.tone == Tone::Silent);
}

void test_parse_clamps_pwm_and_rejects_bad_tone() {
    ActuatorSet s{};
    TEST_ASSERT_TRUE(parseSet("S 42 900 -900 400 -7 2\n", s));
    TEST_ASSERT_EQUAL_INT16(255, s.left);
    TEST_ASSERT_EQUAL_INT16(-255, s.right);
    TEST_ASSERT_EQUAL_UINT8(180, s.deg1);
    TEST_ASSERT_EQUAL_UINT8(0, s.deg2);
    TEST_ASSERT_TRUE(s.tone == Tone::Love);
    TEST_ASSERT_FALSE(parseSet("S 1 0 0 90 90 9\n", s));
    TEST_ASSERT_FALSE(parseSet("H 1\n", s));
}

void test_seq_window_including_wrap() {
    TEST_ASSERT_TRUE(seqAccepts(101, 100));
    TEST_ASSERT_FALSE(seqAccepts(100, 100));
    TEST_ASSERT_FALSE(seqAccepts(99, 100));
    TEST_ASSERT_TRUE(seqAccepts(5, 1000000000u));
    TEST_ASSERT_TRUE(seqAccepts(5u, 0xFFFFFFF0u));
    TEST_ASSERT_FALSE(seqAccepts(0xFFFFFFF0u, 5u));
}

void test_phase_from_timestamps() {
    LinkCore c;
    TEST_ASSERT_TRUE(c.tick(0).phase == LinkPhase::Offline);
    c.setOnline(true);
    TEST_ASSERT_TRUE(c.tick(10).phase == LinkPhase::Searching);
    TEST_ASSERT_TRUE(c.accept(setOf(1), 1000) == AcceptVerdict::Accept);
    TEST_ASSERT_TRUE(c.tick(1400).phase == LinkPhase::Linked);
    TEST_ASSERT_TRUE(c.tick(1600).phase == LinkPhase::Lost);
    TEST_ASSERT_TRUE(c.tick(6100).phase == LinkPhase::Searching);
}

void test_ignore_does_not_refresh_last_set() {
    LinkCore c;
    c.setOnline(true);
    TEST_ASSERT_TRUE(c.accept(setOf(2000), 1000) == AcceptVerdict::Accept);
    TEST_ASSERT_TRUE(c.accept(setOf(2000), 1200) == AcceptVerdict::Ignore);
    TEST_ASSERT_TRUE(c.tick(1600).phase == LinkPhase::Lost);
    TEST_ASSERT_TRUE(c.accept(setOf(1), 1700) == AcceptVerdict::Restart);
    TEST_ASSERT_EQUAL_UINT32(1, c.lastSeq());
}

void test_failsafe_deadman_and_obstacle() {
    const LinkView lost{LinkPhase::Lost, setOf(3, 100, 100, Tone::Beep), 3};
    const Actuation braked = effective(lost, {});
    TEST_ASSERT_EQUAL_INT16(0, braked.left);
    TEST_ASSERT_EQUAL_INT16(0, braked.right);
    TEST_ASSERT_EQUAL_UINT8(90, braked.deg1);
    TEST_ASSERT_TRUE(braked.tone == Tone::Silent);

    const LinkView linked{LinkPhase::Linked, setOf(4, 100, 100, Tone::Beep), 4};
    const Actuation hit = effective(linked, uint16_t{10});
    TEST_ASSERT_EQUAL_INT16(0, hit.left);
    TEST_ASSERT_EQUAL_INT16(0, hit.right);
    TEST_ASSERT_TRUE(hit.tone == Tone::Beep);

    const Actuation turn = effective(
        LinkView{LinkPhase::Linked, setOf(5, 100, -100, Tone::Beep), 5},
        uint16_t{10});
    TEST_ASSERT_EQUAL_INT16(100, turn.left);
    TEST_ASSERT_EQUAL_INT16(-100, turn.right);

    const Actuation offline = effective(
        LinkView{LinkPhase::Offline, setOf(6, 40, 40), 6}, {});
    TEST_ASSERT_EQUAL_INT16(0, offline.left);
    TEST_ASSERT_EQUAL_UINT8(90, offline.deg1);
}

void test_linked_idle_winks_on_seq() {
    const Actuation idle{0, 0, 90, 90, Tone::Silent};
    const LedFrame a = ledFrame(LinkPhase::Linked, idle, 0);
    const LedFrame b = ledFrame(LinkPhase::Linked, idle, 5);
    TEST_ASSERT_FALSE(lit(a.left, 0));
    TEST_ASSERT_FALSE(lit(a.right, 123456));
    TEST_ASSERT_TRUE(lit(b.left, 0));
    TEST_ASSERT_TRUE(lit(b.right, 123456));
}

void test_linked_detect_stays_on() {
    const Actuation seen{200, -40, 90, 90, Tone::Love};
    const LedFrame love = ledFrame(LinkPhase::Linked, seen, 0);
    TEST_ASSERT_EQUAL_UINT16(1, love.left.periodMs);
    TEST_ASSERT_EQUAL_UINT16(1, love.left.onMs);
    TEST_ASSERT_EQUAL_UINT16(1, love.right.periodMs);
    TEST_ASSERT_EQUAL_UINT16(1, love.right.onMs);
    TEST_ASSERT_TRUE(lit(love.left, 0));
    TEST_ASSERT_TRUE(lit(love.right, 123456));

    const LedFrame party = ledFrame(LinkPhase::Linked, Actuation{0, 0, 180, 0, Tone::Party}, 0);
    TEST_ASSERT_TRUE(lit(party.left, 0));
    TEST_ASSERT_TRUE(lit(party.right, 0));

    const LedFrame sad = ledFrame(LinkPhase::Linked, Actuation{0, 0, 30, 150, Tone::Sad}, 0);
    TEST_ASSERT_FALSE(lit(sad.left, 0));
}

void test_led_rows_stay_c1() {
    const Actuation idle{0, 0, 90, 90, Tone::Silent};
    const LedFrame off = ledFrame(LinkPhase::Offline, idle, 0);
    TEST_ASSERT_EQUAL_UINT16(1000, off.left.periodMs);
    TEST_ASSERT_EQUAL_UINT16(500, off.left.onMs);

    const LedFrame search = ledFrame(LinkPhase::Searching, idle, 0);
    TEST_ASSERT_EQUAL_UINT16(0, search.left.offsetMs);
    TEST_ASSERT_EQUAL_UINT16(250, search.right.offsetMs);

    const LedFrame lost = ledFrame(LinkPhase::Lost, idle, 0);
    TEST_ASSERT_EQUAL_UINT16(50, lost.left.onMs);

    const LedFrame drive = ledFrame(LinkPhase::Linked, Actuation{200, 0, 90, 90, Tone::Silent}, 5);
    TEST_ASSERT_EQUAL_UINT16(250, drive.left.periodMs);
    TEST_ASSERT_EQUAL_UINT16(1, drive.right.periodMs);
    TEST_ASSERT_EQUAL_UINT16(1, drive.right.onMs);
}

void test_format_telemetry_absent_sensors() {
    char buf[WIRE_MAX];
    SensorFrame s{};
    const size_t n = formatTelemetry(buf, sizeof buf, 1043, s, 55120);
    TEST_ASSERT_TRUE(n > 0);
    TEST_ASSERT_EQUAL_STRING("T 1043 -1 -1 55120\n", buf);
}

void test_parse_legacy_six_fields_is_say_none() {
    ActuatorSet s{};
    TEST_ASSERT_TRUE(parseSet("S 1043 180 -180 90 90 0\n", s));
    TEST_ASSERT_EQUAL_UINT8(SAY_NONE.token, s.say.token);
    TEST_ASSERT_TRUE(s.say.clip == ClipId::None);
}

void test_parse_eight_fields_lands() {
    ActuatorSet s{};
    TEST_ASSERT_TRUE(parseSet("S 1043 128 128 90 90 2 1 7\n", s));
    TEST_ASSERT_EQUAL_UINT32(1043, s.seq);
    TEST_ASSERT_TRUE(s.tone == Tone::Love);
    TEST_ASSERT_TRUE(s.say.clip == ClipId::FoundHere);
    TEST_ASSERT_EQUAL_UINT8(7, s.say.token);
}

void test_parse_rejects_bad_say_tok_and_seven_fields() {
    ActuatorSet s{};
    TEST_ASSERT_FALSE(parseSet("S 1 0 0 90 90 0 7 1\n", s));
    TEST_ASSERT_FALSE(parseSet("S 1 0 0 90 90 0 1 64\n", s));
    TEST_ASSERT_FALSE(parseSet("S 1 0 0 90 90 0 1\n", s));
}

void test_say_gate_thirty_identical_start_once() {
    SayGate g;
    const Utterance first = utter(0, ClipId::None);
    TEST_ASSERT_TRUE(g.step(viewOf(LinkPhase::Linked, first), 0) == ClipId::None);

    const Utterance want = utter(7, ClipId::FoundHere);
    TEST_ASSERT_TRUE(g.step(viewOf(LinkPhase::Linked, want), 100) == ClipId::FoundHere);
    for (int i = 0; i < 29; ++i) {
        TEST_ASSERT_TRUE(g.step(viewOf(LinkPhase::Linked, want), 100 + (i + 1) * 100) == ClipId::None);
    }
}

void test_say_gate_boot_first_set_silent() {
    SayGate g;
    TEST_ASSERT_TRUE(g.step(viewOf(LinkPhase::Linked, utter(7, ClipId::FoundHere)), 0) == ClipId::None);
}

void test_say_gate_dark_600ms_new_token_fires() {
    SayGate g;
    TEST_ASSERT_TRUE(g.step(viewOf(LinkPhase::Linked, utter(1, ClipId::FoundHere)), 0) == ClipId::None);
    TEST_ASSERT_TRUE(g.step(viewOf(LinkPhase::Lost, utter(1, ClipId::FoundHere)), 300) == ClipId::None);
    TEST_ASSERT_TRUE(g.step(viewOf(LinkPhase::Linked, utter(2, ClipId::SeekWhere)), 600) ==
                     ClipId::SeekWhere);
}

void test_say_gate_dark_2000ms_new_token_silent() {
    SayGate g;
    TEST_ASSERT_TRUE(g.step(viewOf(LinkPhase::Linked, utter(1, ClipId::FoundHere)), 0) == ClipId::None);
    TEST_ASSERT_TRUE(g.step(viewOf(LinkPhase::Lost, utter(1, ClipId::FoundHere)), 1000) == ClipId::None);
    TEST_ASSERT_TRUE(g.step(viewOf(LinkPhase::Linked, utter(2, ClipId::SeekWhere)), 2000) ==
                     ClipId::None);
}

void test_say_gate_not_linked_always_none() {
    SayGate g;
    const Utterance want = utter(3, ClipId::FoundSawYou);
    TEST_ASSERT_TRUE(g.step(viewOf(LinkPhase::Offline, want), 0) == ClipId::None);
    TEST_ASSERT_TRUE(g.step(viewOf(LinkPhase::Searching, want), 10) == ClipId::None);
    TEST_ASSERT_TRUE(g.step(viewOf(LinkPhase::Lost, want), 20) == ClipId::None);
}

void test_say_gate_token_63_to_1_is_a_change() {
    SayGate g;
    TEST_ASSERT_TRUE(g.step(viewOf(LinkPhase::Linked, utter(63, ClipId::SeekCantSee)), 0) ==
                     ClipId::None);
    TEST_ASSERT_TRUE(g.step(viewOf(LinkPhase::Linked, utter(1, ClipId::FoundHere)), 100) ==
                     ClipId::FoundHere);
}

int main() {
    UNITY_BEGIN();
    RUN_TEST(test_parse_set_exact_example);
    RUN_TEST(test_parse_clamps_pwm_and_rejects_bad_tone);
    RUN_TEST(test_seq_window_including_wrap);
    RUN_TEST(test_phase_from_timestamps);
    RUN_TEST(test_ignore_does_not_refresh_last_set);
    RUN_TEST(test_failsafe_deadman_and_obstacle);
    RUN_TEST(test_linked_idle_winks_on_seq);
    RUN_TEST(test_linked_detect_stays_on);
    RUN_TEST(test_led_rows_stay_c1);
    RUN_TEST(test_format_telemetry_absent_sensors);
    RUN_TEST(test_parse_legacy_six_fields_is_say_none);
    RUN_TEST(test_parse_eight_fields_lands);
    RUN_TEST(test_parse_rejects_bad_say_tok_and_seven_fields);
    RUN_TEST(test_say_gate_thirty_identical_start_once);
    RUN_TEST(test_say_gate_boot_first_set_silent);
    RUN_TEST(test_say_gate_dark_600ms_new_token_fires);
    RUN_TEST(test_say_gate_dark_2000ms_new_token_silent);
    RUN_TEST(test_say_gate_not_linked_always_none);
    RUN_TEST(test_say_gate_token_63_to_1_is_a_change);
    return UNITY_END();
}
