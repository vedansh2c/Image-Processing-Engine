#include "image_processing_engine/engine.hpp"
#include <iostream>
#include <cstdlib>
#include <algorithm>
#include <cmath>
int main(int argc,char** argv) {
    try {
        pf::Options o;o.filter=argc>1?argv[1]:"gaussian";
        int iterations=argc>2?std::stoi(argv[2]):5;
        std::cout<<"width,height,mode,workers,median_ms,mp_s,speedup,min_ms,max_ms,checksum,max_pixel_difference\n";
        for(auto [w,h]:std::vector<std::pair<int,int>>{{640,480},{1280,720},{1920,1080},{3840,2160}}) {
            pf::Image image(w,h,3);for(size_t i=0;i<image.pixels.size();++i) image.pixels[i]=uint8_t((i*37+i/97)%256);
            pf::Processor reference_processor(pf::Mode::Sequential,1);
            auto reference=reference_processor.apply(image,o);
            double baseline=0;
            for(auto mode:{std::string("sequential"),std::string("multithreaded"),std::string("optimized")})
                for(unsigned count:mode=="sequential"?std::vector<unsigned>{1}:std::vector<unsigned>{1,2,4,8}) {
                    pf::Processor processor(pf::parse_mode(mode),count);
                    auto output=processor.apply(image,o);
                    int difference=0;
                    for(size_t i=0;i<output.pixels.size();++i) difference=std::max(difference,std::abs(int(output.pixels[i])-int(reference.pixels[i])));
                    if(difference>(o.filter=="gaussian"?1:0)) throw std::runtime_error("output equivalence failed");
                    auto result=pf::benchmark(processor,image,o,iterations);
                    if(mode=="sequential") baseline=result.median_ms;
                    std::cout<<w<<','<<h<<','<<mode<<','<<count<<','<<result.median_ms<<','<<result.mp_s<<','
                             <<baseline/result.median_ms<<','<<result.minimum_ms<<','<<result.maximum_ms<<','<<result.checksum<<','<<difference<<'\n';
                }
        }
    } catch(const std::exception& e) {std::cerr<<e.what()<<'\n';return 1;}
}
