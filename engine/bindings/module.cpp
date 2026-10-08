#include "image_processing_engine/engine.hpp"
#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include <thread>
#include <chrono>
namespace py=pybind11;
namespace {
py::dict metrics(const pf::Measurement& m) {
    py::dict d;d["latency_ms"]=m.median_ms;d["throughput_mp_s"]=m.mp_s;
    d["min_ms"]=m.minimum_ms;d["max_ms"]=m.maximum_ms;d["workers"]=m.workers;d["checksum"]=std::to_string(m.checksum);return d;
}
}
PYBIND11_MODULE(image_processing_engine_native,m) {
    py::class_<pf::Options>(m,"Options").def(py::init<>())
      .def_readwrite("filter",&pf::Options::filter).def_readwrite("kernel",&pf::Options::kernel)
      .def_readwrite("sigma",&pf::Options::sigma).def_readwrite("brightness",&pf::Options::brightness)
      .def_readwrite("contrast",&pf::Options::contrast).def_readwrite("width",&pf::Options::width)
      .def_readwrite("height",&pf::Options::height).def_readwrite("interpolation",&pf::Options::interpolation);
    m.def("system",[]{py::dict d;d["hardware_threads"]=std::thread::hardware_concurrency();d["simd"]=pf::simd_name();return d;});
    m.def("process",[](py::bytes data,pf::Options options,const std::string& mode,unsigned workers) {
        std::string raw=data;std::vector<uint8_t> input(raw.begin(),raw.end()),png;
        int width,height,channels;double latency;size_t input_pixels;
        unsigned actual;
        { py::gil_scoped_release release;
          auto image=pf::decode(input);pf::Processor processor(pf::parse_mode(mode),workers);actual=processor.workers();
          auto start=std::chrono::steady_clock::now();auto output=processor.apply(image,options);
          latency=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count();
          width=output.width;height=output.height;channels=output.channels;png=pf::encode_png(output);
          // Throughput uses input pixels, consistently with the benchmark suite.
          input_pixels=size_t(image.width)*image.height;
        }
        py::dict d;d["png"]=py::bytes(reinterpret_cast<const char*>(png.data()),png.size());
        d["latency_ms"]=latency;d["throughput_mp_s"]=input_pixels/(latency*1000);
        d["width"]=width;d["height"]=height;d["channels"]=channels;d["workers"]=actual;d["mode"]=mode;return d;
    });
    m.def("benchmark",[](pf::Options options,const std::vector<std::pair<int,int>>& resolutions,
                         const std::vector<unsigned>& workers,int iterations) {
        if(resolutions.empty() || resolutions.size()>4 || workers.empty() || workers.size()>4)
            throw std::invalid_argument("choose 1..4 resolutions and worker counts");
        pf::validate(options);
        struct Row {int w,h;std::string mode;pf::Measurement measurement;double baseline;int difference;};
        std::vector<Row> rows;
        { py::gil_scoped_release release;
          for(auto [w,h]:resolutions) {
            pf::Image image(w,h,3);
            for(size_t i=0;i<image.pixels.size();++i) image.pixels[i]=uint8_t((i*37+i/97)%256);
            pf::Processor sequential(pf::Mode::Sequential,1);auto reference=sequential.apply(image,options);
            auto baseline=pf::benchmark(sequential,image,options,iterations);
            rows.push_back({w,h,"sequential",baseline,baseline.median_ms,0});
            for(unsigned count:workers) for(auto mode:{std::string("multithreaded"),std::string("optimized")}) {
                pf::Processor processor(pf::parse_mode(mode),count);auto output=processor.apply(image,options);
                int difference=0;
                for(size_t i=0;i<reference.pixels.size();++i)
                    difference=std::max(difference,std::abs(int(reference.pixels[i])-int(output.pixels[i])));
                if(difference>(options.filter=="gaussian"?1:0)) throw std::runtime_error("mode output equivalence check failed");
                auto measured=pf::benchmark(processor,image,options,iterations);
                rows.push_back({w,h,mode,measured,baseline.median_ms,difference});
            }
          }
        }
        py::list result;
        for(const auto& r:rows) {auto d=metrics(r.measurement);d["width"]=r.w;d["height"]=r.h;d["mode"]=r.mode;
            d["speedup"]=r.baseline/r.measurement.median_ms;d["max_pixel_difference"]=r.difference;
            // Ranges, rather than an invented confidence interval. Overlap makes a comparison inconclusive.
            d["stable"]=r.measurement.maximum_ms/r.measurement.minimum_ms<=1.2;
            result.append(d);
        } return result;
    },py::arg("options"),py::arg("resolutions"),py::arg("workers"),py::arg("iterations")=5);
}
