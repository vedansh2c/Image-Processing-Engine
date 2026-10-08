#include "image_processing_engine/engine.hpp"
#include <chrono>
#include <algorithm>
#include <stdexcept>
namespace pf {
Measurement benchmark(Processor& processor,const Image& image,const Options& options,int iterations,int warmup) {
    image.validate();
    validate(options);
    if(iterations<3 || iterations>15 || warmup<0 || warmup>5) throw std::invalid_argument("iterations must be 3..15; warmup 0..5");
    uint64_t checksum=0;
    auto consume=[&](const Image& out){
        // Observable returned checksum; outside the timed interval.
        for(size_t i=0;i<out.pixels.size();i+=4096) checksum=checksum*131+out.pixels[i];
        checksum=checksum*131+out.pixels.back();
    };
    for(int i=0;i<warmup;++i) consume(processor.apply(image,options));
    std::vector<double> times;
    for(int i=0;i<iterations;++i) {
        auto start=std::chrono::steady_clock::now();
        auto output=processor.apply(image,options);
        auto finish=std::chrono::steady_clock::now();
        times.push_back(std::chrono::duration<double,std::milli>(finish-start).count()); consume(output);
    }
    std::sort(times.begin(),times.end());
    double median=iterations%2 ? times[iterations/2] : (times[iterations/2-1]+times[iterations/2])/2;
    return {median,double(image.width)*image.height/(median*1000),times.front(),times.back(),processor.workers(),checksum};
}
}
