#include "image_processing_engine/engine.hpp"
#if defined(__aarch64__) || defined(_M_ARM64)
#include <arm_neon.h>
#elif defined(__x86_64__) || defined(_M_X64)
#include <emmintrin.h>
#endif
namespace pf {
std::string simd_name() {
#if defined(__aarch64__) || defined(_M_ARM64)
    return "ARM64 NEON (architectural baseline)";
#elif defined(__x86_64__) || defined(_M_X64)
    return "x86-64 SSE2 (architectural baseline)";
#else
    return "portable scalar";
#endif
}
void invert_bytes(const uint8_t* src,uint8_t* dst,size_t length) {
    size_t i=0;
#if defined(__aarch64__) || defined(_M_ARM64)
    for(;i+16<=length;i+=16) vst1q_u8(dst+i,vmvnq_u8(vld1q_u8(src+i)));
#elif defined(__x86_64__) || defined(_M_X64)
    const auto mask=_mm_set1_epi8(char(0xff));
    for(;i+16<=length;i+=16) _mm_storeu_si128(reinterpret_cast<__m128i*>(dst+i),
        _mm_xor_si128(_mm_loadu_si128(reinterpret_cast<const __m128i*>(src+i)),mask));
#endif
    for(;i<length;++i) dst[i]=255-src[i];
}
}
