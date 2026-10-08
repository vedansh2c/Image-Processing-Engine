#include "image_processing_engine/thread_pool.hpp"
#include <stdexcept>
namespace pf {
ThreadPool::ThreadPool(unsigned count) {
    if (!count || count > 32) throw std::invalid_argument("workers must be 1..32");
    try {
        for (unsigned i=0;i<count;++i) workers_.emplace_back([this] {
            for (;;) {
                std::function<void()> task;
                {
                    std::unique_lock<std::mutex> lock(mutex_);
                    ready_.wait(lock,[this]{return stopping_ || !tasks_.empty();});
                    if (stopping_ && tasks_.empty()) return;
                    task=std::move(tasks_.front()); tasks_.pop();
                }
                task();
            }
        });
    } catch (...) {
        { std::lock_guard<std::mutex> lock(mutex_); stopping_=true; }
        ready_.notify_all();
        for (auto& thread:workers_) thread.join();
        throw;
    }
}
ThreadPool::~ThreadPool() {
    { std::lock_guard<std::mutex> lock(mutex_); stopping_=true; }
    ready_.notify_all();
    for (auto& worker:workers_) worker.join();
}
std::future<void> ThreadPool::submit(std::function<void()> fn) {
    auto task=std::make_shared<std::packaged_task<void()>>(std::move(fn));
    auto future=task->get_future();
    { std::lock_guard<std::mutex> lock(mutex_);
      if (stopping_) throw std::runtime_error("pool is stopping");
      tasks_.emplace([task]{(*task)();}); }
    ready_.notify_one(); return future;
}
}
