# Vendored dependencies

`stb_image.h` and `stb_image_write.h` are vendored from nothings/stb revision `f58f558c120e9b32c217290b80bad1a0729fbb2c`. Each file includes its dual public-domain/MIT license. Decoding is restricted at compile time to JPEG and PNG, and decoding allocations use an engine-owned budget.

GoogleTest 1.15.2 is fetched by CMake only for tests. Its archive is checked against SHA-256 `7b42b4d6ed48810c5362c265a17faebe90dc2373c885e5216439d37927f02926`. GoogleTest is BSD-3-Clause licensed; upstream source contains its license. Use `PF_BUILD_TESTS=OFF` to avoid that test dependency.
