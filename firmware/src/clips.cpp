#include "clips.h"

#include "clip_1_ahi_esta.h"
#include "clip_2_te_encontre.h"
#include "clip_3_ya_te_vi.h"
#include "clip_4_donde_estas.h"
#include "clip_5_sali_de_ahi.h"
#include "clip_6_no_te_veo.h"

ClipPcm clipPcm(ClipId id) {
    switch (id) {
        case ClipId::None:
            return {nullptr, 0};
        case ClipId::FoundHere:
            return {CLIP_1_AHI_ESTA_PCM, CLIP_1_AHI_ESTA_LEN};
        case ClipId::FoundGotYou:
            return {CLIP_2_TE_ENCONTRE_PCM, CLIP_2_TE_ENCONTRE_LEN};
        case ClipId::FoundSawYou:
            return {CLIP_3_YA_TE_VI_PCM, CLIP_3_YA_TE_VI_LEN};
        case ClipId::SeekWhere:
            return {CLIP_4_DONDE_ESTAS_PCM, CLIP_4_DONDE_ESTAS_LEN};
        case ClipId::SeekComeOut:
            return {CLIP_5_SALI_DE_AHI_PCM, CLIP_5_SALI_DE_AHI_LEN};
        case ClipId::SeekCantSee:
            return {CLIP_6_NO_TE_VEO_PCM, CLIP_6_NO_TE_VEO_LEN};
    }
    return {nullptr, 0};
}
