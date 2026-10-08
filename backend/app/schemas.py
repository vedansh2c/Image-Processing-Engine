from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

Filter = Literal["grayscale", "adjust", "gaussian", "sobel", "sharpen", "resize", "invert"]
Mode = Literal["sequential", "multithreaded", "optimized"]

class Parameters(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    filter: Filter = "grayscale"
    mode: Mode = "optimized"
    workers: int = Field(default=4, ge=1, le=32, strict=True)
    kernel: int = Field(default=5, ge=1, le=31, strict=True)
    sigma: float = Field(default=1.4, ge=0.1, le=20)
    brightness: float = Field(default=0, ge=-255, le=255)
    contrast: float = Field(default=1, ge=0, le=4)
    width: int = Field(default=640, ge=1, le=8192, strict=True)
    height: int = Field(default=480, ge=1, le=8192, strict=True)
    interpolation: Literal["nearest", "bilinear"] = "bilinear"

    @model_validator(mode="after")
    def dimensions_and_kernel(self):
        if self.kernel % 2 == 0:
            raise ValueError("Gaussian kernel must be odd")
        if self.width * self.height > 16 * 1024 * 1024:
            raise ValueError("Output is limited to 16 megapixels")
        return self

RESOLUTIONS = [(640, 480), (1280, 720), (1920, 1080), (3840, 2160)]

class BenchmarkRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    parameters: Parameters = Field(default_factory=Parameters)
    resolutions: list[tuple[int, int]] = Field(default=[(640, 480)], min_length=1, max_length=4)
    workers: list[Annotated[int, Field(strict=True, ge=1, le=32)]] = Field(default=[1, 2, 4], min_length=1, max_length=4)
    iterations: int = Field(default=5, ge=3, le=15, strict=True)

    @model_validator(mode="after")
    def bounded_suite(self):
        if any(r not in RESOLUTIONS for r in self.resolutions) or len(set(self.resolutions)) != len(self.resolutions):
            raise ValueError("Choose unique supported benchmark resolutions")
        if any(type(w) is not int or not 1 <= w <= 32 for w in self.workers) or len(set(self.workers)) != len(self.workers):
            raise ValueError("Choose unique worker counts from 1 to 32")
        pixels = sum(w*h for w,h in self.resolutions)
        p = self.parameters
        cost = p.kernel**2 if p.filter == "gaussian" else 9 if p.filter in {"sobel", "sharpen"} else 1
        work = pixels * cost * 3 * (self.iterations + 3) * (1 + 2 * len(self.workers))
        if p.filter == "resize":
            work += p.width * p.height * 4 * (self.iterations + 3) * (1 + 2*len(self.workers))
        if work > 40_000_000_000:
            raise ValueError("Benchmark too large: reduce kernel, resolutions, worker counts, or iterations")
        return self
