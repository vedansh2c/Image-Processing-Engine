#include "image_processing_engine/engine.hpp"
#include <gtest/gtest.h>
#include <atomic>
#include <cmath>
#include <limits>
using namespace pf;
TEST(Image, ValidationAndCodec) {
    EXPECT_THROW(Image(0,1,3),std::invalid_argument);
    EXPECT_THROW(Image(2,2,1),std::invalid_argument);
    EXPECT_THROW(Image(8192,8192,4),std::invalid_argument);
    Image in(2,1,4);in.pixels={255,0,0,13,0,255,0,220};auto out=decode(encode_png(in));
    EXPECT_EQ(out.width,2);
    EXPECT_EQ(out.height,1);
    EXPECT_EQ(out.channels,4);
    EXPECT_EQ(out.pixels,in.pixels);
    EXPECT_THROW(decode({1,2,3}),std::invalid_argument);
}
TEST(Filters, LuminanceAndAlpha) {
    Image in(2,1,4);in.pixels={255,0,0,17,0,255,0,99};Processor p(Mode::Sequential,1);Options o;
    auto out=p.apply(in,o);
    EXPECT_EQ(out.pixels,(std::vector<uint8_t>{54,54,54,17,182,182,182,99}));
    o.filter="invert";
    EXPECT_EQ(p.apply(in,o).pixels,(std::vector<uint8_t>{0,255,255,17,255,0,255,99}));
    o.filter="adjust";o.brightness=20;o.contrast=1;
    EXPECT_EQ(p.apply(in,o).pixels[0],255);
    EXPECT_EQ(p.apply(in,o).pixels[1],20);
}
TEST(Convolution, KnownKernelAndClampedBorders) {
    Image in(2,1,3);in.pixels={30,30,30,90,90,90};Processor p(Mode::Sequential,1);
    auto out=p.convolve(in,std::vector<double>(9,1.0/9),3);
    EXPECT_EQ(out.pixels,(std::vector<uint8_t>{50,50,50,70,70,70}));
    EXPECT_EQ(p.convolve(in,{1},1).pixels,in.pixels);
    EXPECT_THROW(p.convolve(in,{1},3),std::invalid_argument);
}
TEST(Gaussian, ReferenceImpulseAndConstant) {
    Processor p(Mode::Sequential,1);Options o;o.filter="gaussian";o.kernel=3;o.sigma=1;
    Image in(3,3,3);in.pixels[in.offset(1,1)]=255;
    auto out=p.apply(in,o);
    EXPECT_EQ(out.pixels[out.offset(1,1)],52);
    EXPECT_EQ(out.pixels[0],19);
    Image constant(1,1,4);constant.pixels={17,77,201,8};
    EXPECT_EQ(p.apply(constant,o).pixels,constant.pixels);
}
TEST(Sobel, KnownRamp) {
    Image in(3,3,3);for(int y=0;y<3;++y)for(int x=0;x<3;++x)for(int c=0;c<3;++c)in.pixels[in.offset(x,y,c)]=x*10;
    Processor p(Mode::Sequential,1);Options o;o.filter="sobel";auto out=p.apply(in,o);
    EXPECT_EQ(out.pixels[out.offset(1,1)],80);
    EXPECT_EQ(out.pixels[0],40);
}
TEST(Resize, BilinearAndNearest) {
    Image in(2,1,4);in.pixels={0,0,0,0,100,100,100,200};Processor p(Mode::Sequential,1);Options o;
    o.filter="resize";o.width=3;o.height=1;auto out=p.apply(in,o);
    EXPECT_EQ(out.pixels,(std::vector<uint8_t>{0,0,0,0,50,50,50,100,100,100,100,200}));
    o.interpolation="nearest";
    EXPECT_EQ(p.apply(in,o).pixels[4],0);
}
TEST(Parallel, AllFiltersAndWorkerCounts) {
    for(int channels:{3,4}) {
        Image image(37,19,channels);for(size_t i=0;i<image.pixels.size();++i) image.pixels[i]=uint8_t(i*71);
        for(auto filter:{"grayscale","adjust","gaussian","sobel","sharpen","resize","invert"}) {
            Options o;o.filter=filter;o.width=23;o.height=41;
            Processor seq(Mode::Sequential,1);auto reference=seq.apply(image,o);
            for(auto mode:{Mode::Multithreaded,Mode::Optimized})for(unsigned n:{1,2,4,32}) {
                Processor p(mode,n);for(int repeat=0;repeat<2;++repeat){auto out=p.apply(image,o);
                    ASSERT_EQ(out.pixels.size(),reference.pixels.size());
                    for(size_t i=0;i<out.pixels.size();++i) EXPECT_LE(std::abs(int(out.pixels[i])-reference.pixels[i]),o.filter=="gaussian"?1:0);
                }
            }
        }
    }
}
TEST(Pool, ExceptionsAndDrainOnShutdown) {
    std::atomic<int> count{0};std::vector<std::future<void>> futures;
    {ThreadPool pool(3);auto bad=pool.submit([]{throw std::runtime_error("test");});
    EXPECT_THROW(bad.get(),std::runtime_error);
     for(int i=0;i<100;++i)futures.emplace_back(pool.submit([&]{++count;}));}
    EXPECT_EQ(count,100);for(auto& f:futures)EXPECT_NO_THROW(f.get());
    EXPECT_THROW(ThreadPool(0),std::invalid_argument);
}
TEST(Validation, InvalidParameters) {
    Processor p(Mode::Sequential,1);Image in(1,1,3);Options o;o.kernel=4;
    EXPECT_THROW(p.apply(in,o),std::invalid_argument);
    o.kernel=5;o.sigma=std::numeric_limits<double>::quiet_NaN();
    EXPECT_THROW(p.apply(in,o),std::invalid_argument);
    o.sigma=1;o.filter="invalid";
    EXPECT_THROW(p.apply(in,o),std::invalid_argument);
    EXPECT_THROW(parse_mode("bad"),std::invalid_argument);
    EXPECT_THROW(Processor(Mode::Optimized,33),std::invalid_argument);
}
TEST(Benchmark, RealMeasurementsAndInvalidIterations) {
    Image in(40,30,3);Processor p(Mode::Sequential,1);Options o;auto m=benchmark(p,in,o,3);
    EXPECT_GT(m.median_ms,0);
    EXPECT_GT(m.mp_s,0);
    EXPECT_LE(m.minimum_ms,m.median_ms);
    EXPECT_GE(m.maximum_ms,m.median_ms);
    EXPECT_THROW(benchmark(p,in,o,0),std::invalid_argument);
}

TEST(Image, CorruptBufferRejected) {
    Image image(3,2,4);image.pixels.clear();
    Processor p(Mode::Sequential,1);Options o;
    EXPECT_THROW(p.apply(image,o),std::invalid_argument);
    EXPECT_THROW(encode_png(image),std::invalid_argument);
}

TEST(Gaussian, ExtremeParametersAndThinImages) {
    for(auto shape:std::vector<std::pair<int,int>>{{1,9},{11,1},{7,5}}) {
        Image image(shape.first,shape.second,4);
        for(size_t i=0;i<image.pixels.size();++i)image.pixels[i]=uint8_t(i*73);
        for(int kernel:{1,3,31})for(double sigma:{0.1,1.4,20.0}) {
            Options o;o.filter="gaussian";o.kernel=kernel;o.sigma=sigma;
            Processor seq(Mode::Sequential,1),opt(Mode::Optimized,4);
            auto reference=seq.apply(image,o),result=opt.apply(image,o);
            for(size_t i=0;i<result.pixels.size();++i)EXPECT_LE(std::abs(int(result.pixels[i])-reference.pixels[i]),1);
        }
    }
}
