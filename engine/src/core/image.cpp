#include "image_processing_engine/engine.hpp"
#include <stdexcept>
#include <limits>
#include <cstdlib>
#include <cstring>
#include <cstddef>
namespace {
// Per-decoding-thread budget also bounds hostile PNG streams with tiny IHDRs.
thread_local size_t codec_used=0;
thread_local size_t codec_limit=256*1024*1024;
struct alignas(std::max_align_t) Allocation {size_t size;};
void* codec_alloc(size_t n) {
    if(n>codec_limit-codec_used || n>SIZE_MAX-sizeof(Allocation)) return nullptr;
    auto* block=static_cast<Allocation*>(std::malloc(sizeof(Allocation)+n));
    if(!block) return nullptr;
    block->size=n;codec_used+=n;return block+1;
}
void codec_free(void* p) {if(!p)return;auto* block=static_cast<Allocation*>(p)-1;codec_used-=block->size;std::free(block);}
void* codec_realloc(void* p,size_t n) {
    if(!p)return codec_alloc(n);
    auto* block=static_cast<Allocation*>(p)-1;const size_t old=block->size;
    if(n>codec_limit-(codec_used-old) || n>SIZE_MAX-sizeof(Allocation))return nullptr;
    auto* next=static_cast<Allocation*>(std::realloc(block,sizeof(Allocation)+n));
    if(!next)return nullptr;next->size=n;codec_used=codec_used-old+n;return next+1;
}
struct CodecBudget {
    size_t previous=codec_limit;
    explicit CodecBudget(size_t bytes){codec_limit=std::min(size_t(256*1024*1024),size_t(8*1024*1024)+bytes*4);}
    ~CodecBudget(){codec_limit=previous;}
};
}
#define STBI_MALLOC codec_alloc
#define STBI_REALLOC codec_realloc
#define STBI_FREE codec_free
#define STBI_ONLY_PNG
#define STBI_ONLY_JPEG
#define STBI_MAX_DIMENSIONS 8192
#define STB_IMAGE_IMPLEMENTATION
#include "stb_image.h"
#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb_image_write.h"
namespace pf {
Image::Image(int w,int h,int c):width(w),height(h),channels(c) {
    if(w<=0 || h<=0 || w>max_dimension || h>max_dimension ||
       size_t(w)*h>max_pixels || (c!=3 && c!=4))
        throw std::invalid_argument("image must be RGB/RGBA, at most 8192 per side and 16 megapixels");
    pixels.resize(size_t(w)*h*c);
}
void Image::validate() const {
    if(width<=0 || height<=0 || width>max_dimension || height>max_dimension ||
       size_t(width)*height>max_pixels || (channels!=3 && channels!=4) ||
       pixels.size()!=size_t(width)*height*channels) throw std::invalid_argument("invalid image buffer or dimensions");
}
Image decode(const std::vector<uint8_t>& data) {
    if(data.empty() || data.size()>20*1024*1024) throw std::invalid_argument("image must be 1 byte..20 MiB");
    int w,h,c;
    if(!stbi_info_from_memory(data.data(),int(data.size()),&w,&h,&c))
        throw std::invalid_argument("unsupported or malformed PNG/JPEG image");
    Image image(w,h,c==2 || c==4 ? 4 : 3);
    CodecBudget budget(image.pixels.size());
    using Pixels=std::unique_ptr<stbi_uc,decltype(&stbi_image_free)>;
    Pixels decoded(stbi_load_from_memory(data.data(),int(data.size()),&w,&h,&c,image.channels),stbi_image_free);
    if(!decoded) throw std::invalid_argument("unable to decode image");
    std::copy(decoded.get(),decoded.get()+image.pixels.size(),image.pixels.begin());
    return image;
}
std::vector<uint8_t> encode_png(const Image& image) {
    image.validate();
    int length=0;
    using Bytes=std::unique_ptr<unsigned char,decltype(&free)>;
    Bytes png(stbi_write_png_to_mem(image.pixels.data(),image.width*image.channels,
                                   image.width,image.height,image.channels,&length),free);
    if(!png) throw std::runtime_error("PNG encoding failed");
    return {png.get(),png.get()+length};
}
}
