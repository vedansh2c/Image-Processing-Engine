#include "image_processing_engine/engine.hpp"
#include <algorithm>
#include <cmath>
#include <stdexcept>
namespace pf {
namespace {
uint8_t byte(double v) { return uint8_t(std::clamp(std::round(v),0.0,255.0)); }
int bound(int v,int max) { return std::clamp(v,0,max-1); }
std::vector<double> gaussian(int side,double sigma) {
    std::vector<double> k(side); double sum=0;
    for(int i=0;i<side;++i) { double x=i-side/2; sum+=(k[i]=std::exp(-x*x/(2*sigma*sigma))); }
    for(auto& v:k) v/=sum;
    return k;
}
}
Mode parse_mode(const std::string& mode) {
    if(mode=="sequential") return Mode::Sequential;
    if(mode=="multithreaded") return Mode::Multithreaded;
    if(mode=="optimized") return Mode::Optimized;
    throw std::invalid_argument("unknown execution mode");
}
void validate(const Options& o) {
    const std::vector<std::string> filters={"grayscale","adjust","gaussian","sobel","sharpen","resize","invert"};
    if(std::find(filters.begin(),filters.end(),o.filter)==filters.end()) throw std::invalid_argument("unknown filter");
    if(o.kernel<1 || o.kernel>31 || o.kernel%2==0 || !std::isfinite(o.sigma) || o.sigma<0.1 || o.sigma>20)
        throw std::invalid_argument("kernel must be odd, 1..31; sigma must be 0.1..20");
    if(!std::isfinite(o.brightness) || std::abs(o.brightness)>255 || !std::isfinite(o.contrast) || o.contrast<0 || o.contrast>4)
        throw std::invalid_argument("brightness must be -255..255; contrast must be 0..4");
    if(o.width<1 || o.height<1 || o.width>max_dimension || o.height>max_dimension || size_t(o.width)*o.height>max_pixels)
        throw std::invalid_argument("invalid resize dimensions");
    if(o.interpolation!="nearest" && o.interpolation!="bilinear") throw std::invalid_argument("unknown interpolation");
}
Processor::Processor(Mode mode,unsigned workers):mode_(mode),workers_(mode==Mode::Sequential?1:workers) {
    if(!workers || workers>32) throw std::invalid_argument("workers must be 1..32");
    if(mode!=Mode::Sequential) pool_=std::make_unique<ThreadPool>(workers_);
}
void Processor::rows(int height,const std::function<void(int,int)>& fn) {
    if(!pool_) {fn(0,height);return;}
    std::vector<std::future<void>> futures;
    // One contiguous stripe per worker, with no writes shared between tasks.
    std::exception_ptr error;
    try {
        for(unsigned i=0;i<std::min(unsigned(height),workers_);++i) {
            const int n=int(std::min(unsigned(height),workers_));
            const int begin=int(i)*height/n,end=(int(i)+1)*height/n;
            futures.emplace_back(pool_->submit([&,begin,end]{fn(begin,end);}));
        }
    } catch (...) {error=std::current_exception();}
    // Drain every task even on failure so references cannot outlive their inputs.
    for(auto& f:futures) try {f.get();} catch (...) {if(!error) error=std::current_exception();}
    if(error) std::rethrow_exception(error);
}
Image Processor::convolve(const Image& in,const std::vector<double>& kernel,int side) {
    in.validate();
    if(side<1 || side>31 || side%2==0 || kernel.size()!=size_t(side*side)) throw std::invalid_argument("invalid convolution kernel");
    for(double v:kernel) if(!std::isfinite(v)) throw std::invalid_argument("non-finite kernel");
    Image out(in.width,in.height,in.channels);
    rows(in.height,[&](int begin,int end){
        for(int y=begin;y<end;++y) for(int x=0;x<in.width;++x) {
            for(int c=0;c<3;++c) {double sum=0;
                for(int ky=0;ky<side;++ky) for(int kx=0;kx<side;++kx)
                    sum+=kernel[ky*side+kx]*in.pixels[in.offset(bound(x+kx-side/2,in.width),bound(y+ky-side/2,in.height),c)];
                out.pixels[out.offset(x,y,c)]=byte(sum);
            }
            if(in.channels==4) out.pixels[out.offset(x,y,3)]=in.pixels[in.offset(x,y,3)];
        }
    }); return out;
}
Image Processor::gaussian_separable(const Image& in,const Options& o) {
    auto k=gaussian(o.kernel,o.sigma);
    // Keep floating-point intermediate values, rounding only after the final pass.
    std::vector<double> tmp(size_t(in.width)*in.height*3);
    Image out(in.width,in.height,in.channels);
    rows(in.height,[&](int begin,int end){
        for(int y=begin;y<end;++y) for(int x=0;x<in.width;++x) for(int c=0;c<3;++c) {
            double sum=0;
            for(int j=0;j<o.kernel;++j) sum+=k[j]*in.pixels[in.offset(bound(x+j-o.kernel/2,in.width),y,c)];
            tmp[(size_t(y)*in.width+x)*3+c]=sum;
        }
    });
    rows(in.height,[&](int begin,int end){
        for(int y=begin;y<end;++y) for(int x=0;x<in.width;++x) {
            for(int c=0;c<3;++c) {double sum=0;
                for(int j=0;j<o.kernel;++j) sum+=k[j]*tmp[(size_t(bound(y+j-o.kernel/2,in.height))*in.width+x)*3+c];
                out.pixels[out.offset(x,y,c)]=byte(sum);
            }
            if(in.channels==4) out.pixels[out.offset(x,y,3)]=in.pixels[in.offset(x,y,3)];
        }
    }); return out;
}
Image Processor::apply(const Image& in,const Options& o) {
    in.validate();
    validate(o);
    if(o.filter=="gaussian") {
        if(mode_==Mode::Optimized) return gaussian_separable(in,o);
        auto k=gaussian(o.kernel,o.sigma); std::vector<double> full(o.kernel*o.kernel);
        for(int y=0;y<o.kernel;++y) for(int x=0;x<o.kernel;++x) full[y*o.kernel+x]=k[y]*k[x];
        return convolve(in,full,o.kernel);
    }
    if(o.filter=="sharpen") return convolve(in,{0,-1,0,-1,5,-1,0,-1,0},3);
    // Dispatch once, rather than compare filter strings for every pixel.
    const bool resize=o.filter=="resize",invert=o.filter=="invert";
    const bool sobel=o.filter=="sobel",grayscale=o.filter=="grayscale";
    const bool nearest=o.interpolation=="nearest";
    Image out(resize?o.width:in.width,resize?o.height:in.height,in.channels);
    rows(out.height,[&](int begin,int end){
        for(int y=begin;y<end;++y) {
            if(invert && mode_==Mode::Optimized) {
                const auto offset=in.offset(0,y); const size_t length=size_t(in.width)*in.channels;
                invert_bytes(in.pixels.data()+offset,out.pixels.data()+offset,length);
                if(in.channels==4) for(int x=0;x<in.width;++x) out.pixels[in.offset(x,y,3)]=in.pixels[in.offset(x,y,3)];
                continue;
            }
            for(int x=0;x<out.width;++x) {
                if(resize) {
                    if(nearest) {
                        int sx=std::min(in.width-1,int(int64_t(x)*in.width/out.width));
                        int sy=std::min(in.height-1,int(int64_t(y)*in.height/out.height));
                        for(int c=0;c<in.channels;++c) out.pixels[out.offset(x,y,c)]=in.pixels[in.offset(sx,sy,c)];
                    } else {
                        double sx=std::clamp((x+0.5)*in.width/out.width-0.5,0.0,double(in.width-1));
                        double sy=std::clamp((y+0.5)*in.height/out.height-0.5,0.0,double(in.height-1));
                        int x0=int(sx),y0=int(sy),x1=std::min(x0+1,in.width-1),y1=std::min(y0+1,in.height-1);
                        double fx=sx-x0,fy=sy-y0;
                        for(int c=0;c<in.channels;++c) out.pixels[out.offset(x,y,c)]=byte(
                            (1-fy)*((1-fx)*in.pixels[in.offset(x0,y0,c)]+fx*in.pixels[in.offset(x1,y0,c)])+
                            fy*((1-fx)*in.pixels[in.offset(x0,y1,c)]+fx*in.pixels[in.offset(x1,y1,c)]));
                    } continue;
                }
                auto index=in.offset(x,y);
                if(sobel) {
                    constexpr int gx[9]={-1,0,1,-2,0,2,-1,0,1},gy[9]={-1,-2,-1,0,0,0,1,2,1};
                    double dx=0,dy=0;
                    for(int j=0;j<9;++j) {auto p=in.offset(bound(x+j%3-1,in.width),bound(y+j/3-1,in.height));
                        double l=0.2126*in.pixels[p]+0.7152*in.pixels[p+1]+0.0722*in.pixels[p+2];
                        dx+=gx[j]*l;dy+=gy[j]*l;
                    }
                    auto v=byte(std::hypot(dx,dy)); for(int c=0;c<3;++c) out.pixels[index+c]=v;
                } else if(grayscale) {
                    auto v=byte(0.2126*in.pixels[index]+0.7152*in.pixels[index+1]+0.0722*in.pixels[index+2]);
                    for(int c=0;c<3;++c) out.pixels[index+c]=v;
                } else for(int c=0;c<3;++c) out.pixels[index+c]=invert?255-in.pixels[index+c]:
                    byte((in.pixels[index+c]-127.5)*o.contrast+127.5+o.brightness);
                if(in.channels==4) out.pixels[index+3]=in.pixels[index+3];
            }
        }
    }); return out;
}
}
