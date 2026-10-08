#pragma once
#include <cstdint>
#include <vector>
#include <string>
#include <functional>
#include <memory>
#include "image_processing_engine/thread_pool.hpp"
namespace pf {
constexpr int max_dimension = 8192;
constexpr size_t max_pixels = 16 * 1024 * 1024;
struct Image {
    int width, height, channels;
    std::vector<uint8_t> pixels;
    Image(int w, int h, int c);
    void validate() const;
    size_t offset(int x, int y, int c = 0) const { return (size_t(y)*width+x)*channels+c; }
};
Image decode(const std::vector<uint8_t>& data);
std::vector<uint8_t> encode_png(const Image& image);
enum class Mode { Sequential, Multithreaded, Optimized };
Mode parse_mode(const std::string& mode);
struct Options {
    std::string filter = "grayscale";
    int kernel = 5;
    double sigma = 1.4, brightness = 0, contrast = 1;
    int width = 640, height = 480;
    std::string interpolation = "bilinear";
};
void validate(const Options& options);
class Processor {
    Mode mode_;
    unsigned workers_;
    std::unique_ptr<ThreadPool> pool_;
    void rows(int height, const std::function<void(int,int)>& fn);
    Image gaussian_separable(const Image&, const Options&);
public:
    Processor(Mode mode, unsigned workers);
    Image apply(const Image&, const Options&);
    Image convolve(const Image&, const std::vector<double>& kernel, int side);
    unsigned workers() const { return workers_; }
};
struct Measurement {
    double median_ms, mp_s, minimum_ms, maximum_ms;
    unsigned workers;
    uint64_t checksum;
};
Measurement benchmark(Processor&, const Image&, const Options&, int iterations, int warmup = 2);
std::string simd_name();
void invert_bytes(const uint8_t* src, uint8_t* dst, size_t length);
}
